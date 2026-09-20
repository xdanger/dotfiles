"""TapDB 2.0 事件分析命令 (evtapi)。"""

import hashlib
import json
import re
import urllib.parse
import uuid
from contextlib import suppress
from typing import Any

from ..http import output
from ..query import evtapi_get, evtapi_post

DASHBOARD_WEB_URLS = {
    "cn": "https://www.tapdb.com/dm/m/kb/kanban",
    "sg": "https://console.ap-sg.tapdb.developer.taptap.com/dm/m/kb/kanban",
}

STAID_QUOTA_GROUP = "staid_type"
NUMBER_PROP_TYPES = {"bigint", "decimal", "double", "float", "int", "integer", "long", "number"}
STRING_PROP_TYPES = {"char", "string", "varchar"}
DATETIME_PROP_TYPES = {"date", "datetime", "timestamp"}
BOOL_PROP_TYPES = {"bool", "boolean"}
ARRAY_STRING_PROP_TYPES = {"array_string", "list_string", "set_string"}
VIRTUAL_PROPERTY_NAME_PATTERN = re.compile(r"^#vp@[0-9a-zA-Z_]{1,96}$")
PHYSICAL_METADATA_NAME_PATTERN = re.compile(r"^[a-zA-Z][0-9a-zA-Z_]{1,99}$")
# Mirrors the web console's preset-metadata policy. These projects must not
# mutate preset metadata through an alternate write path.
PRESET_METADATA_EDIT_BLOCKED_PROJECT_IDS = frozenset({"159"})
VIRTUAL_PROPERTY_TYPE_PAIRS = {
    ("varchar", "string"),
    ("varchar", "array_string"),
    ("double", "number"),
    ("integer", "number"),
    ("bigint", "number"),
    ("boolean", "bool"),
    ("timestamp", "datetime"),
}
EVENT_TIME_COLUMN = "time"
DEFAULT_EVENT_TIME_PARTICLE_SIZE = "day"
TOTAL_TIME_PARTICLE_SIZE = "total"
EVENT_TIME_PARTICLE_SIZES = {"minute", "hour", "day", "week", "month"}


def _json_decode_candidates(raw):
    candidates = []
    cur = raw
    for _ in range(4):
        if cur not in candidates:
            candidates.append(cur)
        nxt = urllib.parse.unquote(cur)
        if nxt == cur:
            break
        cur = nxt
    return candidates


def _load_cluster_json(value, field_name="qp"):
    """Load plain or URL-encoded JSON from CLI input."""
    if not value:
        return None
    raw = value
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        raise ValueError(f"{field_name} must be a JSON string")
    if raw.startswith("qp=") or "&qp=" in raw:
        parsed_qs = urllib.parse.parse_qs(raw.lstrip("?"), keep_blank_values=True)
        if parsed_qs.get("qp"):
            raw = parsed_qs["qp"][0]
    for candidate in _json_decode_candidates(raw):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise ValueError(f"{field_name} must be valid JSON")


def _json_dumps_compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _frontend_encode_json(value):
    # tapdb-web-v3 uses encodeURIComponent(JSON.stringify(qp)) before form POST.
    return urllib.parse.quote(_json_dumps_compact(value), safe="-_.!~*'()")


def _maybe_parse_nested_json(obj, field_name):
    value = obj.get(field_name)
    if isinstance(value, str):
        with suppress(ValueError):
            obj[field_name] = _load_cluster_json(value, field_name)


def _normalize_tag_qp(qp, tag_type=None):
    """Normalize userTag qp to the encoded frontend format expected by service."""
    qp_obj = _load_cluster_json(qp, "tag qp")
    if qp_obj is None:
        return None
    if not isinstance(qp_obj, dict):
        raise ValueError("tag qp must be a JSON object")

    _maybe_parse_nested_json(qp_obj, "userTagDefs")
    _maybe_parse_nested_json(qp_obj, "userClusterDefRestore")

    inferred_tag_type = tag_type
    if not inferred_tag_type:
        if "userTagDefs" in qp_obj:
            inferred_tag_type = "quotation"
        elif "sql" in qp_obj:
            inferred_tag_type = "sql"

    if inferred_tag_type == "quotation":
        user_tag_defs = qp_obj.get("userTagDefs")
        if not isinstance(user_tag_defs, list) or not user_tag_defs:
            raise ValueError("quotation tag qp must include non-empty userTagDefs array")
        if "userClusterDefRestore" not in qp_obj:
            qp_obj["userClusterDefRestore"] = {"custom": []}
        qp_obj.setdefault("back_up_switch", False)
    elif inferred_tag_type == "sql":
        if not qp_obj.get("sql"):
            raise ValueError("sql tag qp must include sql")
        qp_obj.setdefault("refresh_schedule", "00:10")
        qp_obj.setdefault("back_up_switch", False)

    return _frontend_encode_json(qp_obj)


def _response_data_dict(result):
    if not isinstance(result, dict):
        return None
    data = result.get("data")
    return data if isinstance(data, dict) else result


def _api_response_failed(result):
    if not isinstance(result, dict) or result.get("error") or result.get("success") is False:
        return True
    code = result.get("code")
    return code is not None and str(code) not in {"0", "200"}


def _bool_value(value):
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _tag_qp_from_detail(result, requested_tag_type=None):
    """Rebuild the existing editable qp from userTag/info without changing it."""
    if _api_response_failed(result):
        raise ValueError("读取现有标签详情失败")
    detail = _response_data_dict(result)
    if not detail:
        raise ValueError("标签详情为空")

    actual_tag_type = detail.get("tagType") or detail.get("tag_type")
    if requested_tag_type and actual_tag_type and requested_tag_type != actual_tag_type:
        raise ValueError(
            f"--tag-type={requested_tag_type} 与现有标签类型 {actual_tag_type} 不一致"
        )
    tag_type = requested_tag_type or actual_tag_type

    direct_qp = detail.get("qp")
    if direct_qp:
        return _normalize_tag_qp(direct_qp, tag_type)

    # File tags are edited by reusing their existing uploaded file on the
    # backend; the official frontend does not send qp for this tag type.
    if tag_type == "file":
        return None

    if tag_type == "sql":
        sql_value = detail.get("sql") or detail.get("userTagDef") or detail.get("user_tag_def")
        if not isinstance(sql_value, str) or not sql_value.strip():
            raise ValueError("SQL 标签详情缺少可复用的 userTagDef/sql")
        qp_obj = {
            "sql": sql_value,
            "refresh_schedule": detail.get("refreshSchedule") or detail.get("refresh_schedule") or "00:10",
            "back_up_switch": _bool_value(detail.get("backUpSwitch", detail.get("back_up_switch", False))),
        }
        return _normalize_tag_qp(qp_obj, tag_type)

    user_tag_defs = detail.get("userTagDefs")
    if user_tag_defs is None:
        user_tag_defs = detail.get("userTagDef") or detail.get("user_tag_def")
    restore = detail.get("userClusterDefRestore") or detail.get("user_cluster_def_restore")
    if isinstance(user_tag_defs, str):
        user_tag_defs = _load_cluster_json(user_tag_defs, "userTagDef")
    if isinstance(restore, str):
        restore = _load_cluster_json(restore, "userClusterDefRestore")
    if isinstance(user_tag_defs, dict):
        user_tag_defs = user_tag_defs.get("userTagDefs") or [user_tag_defs]
    if not isinstance(user_tag_defs, list) or not user_tag_defs:
        raise ValueError("标签详情缺少可复用的 userTagDef/userTagDefs")
    if not isinstance(restore, dict):
        raise ValueError("标签详情缺少可复用的 userClusterDefRestore")
    qp_obj = {
        "userTagDefs": user_tag_defs,
        "userClusterDefRestore": restore,
        "back_up_switch": _bool_value(detail.get("backUpSwitch", detail.get("back_up_switch", False))),
    }
    return _normalize_tag_qp(qp_obj, tag_type)


def _cluster_filter_to_socket(item):
    """Mirror tapdb-web-v3 collectSocketFilters for cluster qp."""
    if not isinstance(item, dict):
        return None
    dimension = item.get("dimension") or {}
    filter_info = item.get("filter") or {}
    filter_key = filter_info.get("key") or item.get("calculateSymbol")
    if not filter_key:
        return None

    out = {
        "columnName": dimension.get("quota") or dimension.get("columnName"),
        "columnType": dimension.get("columnType"),
        "tableType": dimension.get("tableType"),
        "selectType": dimension.get("selectType"),
        "calculateSymbol": filter_key,
    }
    for src, dst in (
        ("propId", "propId"),
        ("columnIndex", "columnIndex"),
        ("virtualType", "virtualType"),
        ("quotaDesc", "columnDesc"),
    ):
        if dimension.get(src) is not None:
            out[dst] = dimension.get(src)

    history = item.get("history") or {}
    if dimension.get("hasHistoryTag") and history:
        out["clusterDatePolicy"] = history.get("type")
        if history.get("type") == "SPECIFIED":
            out["specifiedClusterDate"] = history.get("date")

    value = item.get("value")
    use_filter_key = filter_key
    use_filter_value = value
    if filter_key == "element_at" and isinstance(value, dict):
        element_symbol = value.get("elementCalculateSymbol") or {}
        use_filter_key = element_symbol.get("key") or "" if isinstance(element_symbol, dict) else element_symbol or ""
        out["elementPosition"] = value.get("elementPosition") or 1
        out["elementCalculateSymbol"] = use_filter_key
        use_filter_value = value.get("value")

    if use_filter_key in {
        "rel_cur_time",
        "rel_event_time",
        "rel_init_event_time",
        "rel_return_event_time",
    }:
        use_filter_value = use_filter_value or {}
        if use_filter_key in {"rel_event_time", "rel_init_event_time", "rel_return_event_time"}:
            out["timeUnit"] = use_filter_value.get("unit")
        out["timeRelative"] = use_filter_value.get("relative")
        if out.get("timeRelative") in {"that_day", "that_week", "that_month"}:
            out["timeUnit"] = ""
            out["ftv"] = []
        elif use_filter_value.get("value") is not None:
            out["ftv"] = use_filter_value.get("value")
        else:
            return None
    elif use_filter_key in {"not_empty", "empty", "bool", "boolean_true", "boolean_false"}:
        out["ftv"] = []
    elif isinstance(use_filter_value, list):
        if not use_filter_value:
            return None
        out["ftv"] = use_filter_value
    elif use_filter_value is not None and use_filter_value != "":
        out["ftv"] = [use_filter_value]
    else:
        return None

    return {k: v for k, v in out.items() if v is not None}


def _cluster_filters_to_socket(filters):
    rows = []
    if not isinstance(filters, list):
        return rows
    for item in filters:
        row = _cluster_filter_to_socket(item)
        if row:
            rows.append(row)
    return rows


def _cluster_event_to_socket(item):
    """Mirror tapdb-web-v3 collectSocketEventsCondition for condition clusters."""
    if not isinstance(item, dict):
        return None
    item_type = item.get("type")
    if item_type == "index":
        data = item.get("data") or {}
        event = data.get("event") or {}
        properties = data.get("properties") or {}
        quotas = data.get("quotas") or {}

        out = {
            "eventDesc": event.get("eventDesc"),
            "eventId": event.get("eventId"),
            "eventName": event.get("eventName"),
            "eventNameDisplay": data.get("name") or "",
            "type": 0,
        }
        if quotas.get("quota"):
            out["analysis"] = quotas.get("quota")
            out["analysisDesc"] = quotas.get("quotaDesc")
            out["quota"] = properties.get("quota")
            out["quotaDesc"] = properties.get("quotaDesc")
        elif properties.get("quota"):
            out["analysis"] = properties.get("quota")
            out["analysisDesc"] = properties.get("quotaDesc")

        filters = (data.get("filters") or {}).get("items") or []
        if filters:
            out["relation"] = (data.get("filters") or {}).get("relation") or "and"
            out["filters"] = _cluster_filters_to_socket(filters)
    elif item_type == "formula":
        data = item.get("formulaData") or {}
        out = {
            "type": 1,
            "eventName": "",
            "eventDesc": data.get("name") or "",
            "customEvent": "",
            "dataFormat": data.get("unit"),
            "customFilters": [],
        }
        custom_event_parts = []
        if data.get("leftBracket"):
            custom_event_parts.append(data.get("leftBracket"))
        for index, formula_item in enumerate(data.get("items") or []):
            event = formula_item.get("event") or {}
            properties = formula_item.get("properties") or {}
            quotas = formula_item.get("quotas") or {}
            event_item_parts = [
                event.get("eventName") or "",
                properties.get("quota") or "",
            ]
            if quotas.get("quota"):
                event_item_parts.append(quotas.get("quota"))
            custom_event_parts.append(".".join(event_item_parts))
            if formula_item.get("rightBracket"):
                custom_event_parts.append(formula_item.get("rightBracket"))

            filters_obj = formula_item.get("filters") or {}
            filters = filters_obj.get("items") or []
            if filters:
                out["customFilters"].append(
                    {
                        "index": index,
                        "relation": filters_obj.get("relation") or "and",
                        "filters": _cluster_filters_to_socket(filters),
                    }
                )
        out["customEvent"] = "".join(custom_event_parts)
        filters_obj = data.get("filters") or {}
        filters = filters_obj.get("items") or []
        if filters:
            out["relation"] = filters_obj.get("relation") or "and"
            out["filters"] = _cluster_filters_to_socket(filters)
    else:
        raise ValueError(f"unsupported cluster custom item type: {item_type}")

    date_info = item.get("date") or {}
    if date_info.get("chooseDateKey"):
        out["recentDay"] = date_info.get("chooseDateKey")
    if date_info.get("beginDate"):
        out["startTime"] = date_info.get("beginDate")
    if date_info.get("endDate"):
        out["endTime"] = date_info.get("endDate")

    if str(item.get("doing", "1")) == "1":
        choose = (item.get("quotaDist") or {}).get("choose") or {}
        out["calculateSymbol"] = choose.get("key")
        out["calculateSymbolDesc"] = choose.get("value")
        quota_values = (item.get("quotaDist") or {}).get("value") or []
        if not isinstance(quota_values, list):
            quota_values = [quota_values]
        out["num"] = ",".join(str(v if v else 0) for v in quota_values)
    else:
        out["calculateSymbol"] = "eq"
        out["calculateSymbolDesc"] = "等于"
        out["num"] = "0"

    return {k: v for k, v in out.items() if v is not None}


def _cluster_restore_to_backend_def(restore):
    if not isinstance(restore, dict):
        raise ValueError("cluster restore qp must be a JSON object")
    custom_relation = restore.get("customRelation") or {}
    global_dimension = restore.get("globalDimension") or {}
    backend_def = {
        "eventsFiltersRelation": custom_relation.get("first") or "and",
        "eventsRelation": custom_relation.get("second") or "and",
        "events": [],
        "filters": [],
    }
    for item in restore.get("custom") or []:
        event_row = _cluster_event_to_socket(item)
        if event_row:
            backend_def["events"].append(event_row)
    filters = _cluster_filters_to_socket(global_dimension.get("items") or [])
    if filters:
        backend_def["filtersRelation"] = global_dimension.get("relation") or "and"
        backend_def["filters"] = filters
    return backend_def


def _normalize_cluster_qp(qp):
    """Return backend-ready qp JSON containing userClusterDef and restore."""
    qp_obj = _load_cluster_json(qp)
    if not qp_obj:
        return None
    if not isinstance(qp_obj, dict):
        raise ValueError("cluster qp must be a JSON object")

    if "userClusterDef" in qp_obj:
        if "userClusterDefRestore" not in qp_obj:
            raise ValueError("cluster qp with userClusterDef must include userClusterDefRestore")
        if isinstance(qp_obj["userClusterDefRestore"], str):
            qp_obj["userClusterDefRestore"] = _load_cluster_json(
                qp_obj["userClusterDefRestore"],
                "userClusterDefRestore",
            )
        return json.dumps(qp_obj, ensure_ascii=False, separators=(",", ":"))

    if {"custom", "globalDimension", "customRelation"} <= set(qp_obj.keys()):
        restore = qp_obj
    elif "userClusterDefRestore" in qp_obj:
        restore = qp_obj["userClusterDefRestore"]
        if isinstance(restore, str):
            restore = _load_cluster_json(restore, "userClusterDefRestore")
    else:
        raise ValueError(
            'cluster qp must be either frontend restore JSON or {"userClusterDef":...,"userClusterDefRestore":...}'
        )

    full_qp = {
        "userClusterDef": _cluster_restore_to_backend_def(restore),
        "userClusterDefRestore": restore,
    }
    return json.dumps(full_qp, ensure_ascii=False, separators=(",", ":"))


def _flatten_event_groups(result):
    """Flatten grouped event payload into a list with eventCategory attached."""
    if not isinstance(result, dict):
        return result
    data = result.get("data")
    if not isinstance(data, dict):
        return result

    rows = []
    for category, items in data.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            row = dict(item)
            row["eventCategory"] = category
            rows.append(row)

    flattened = dict(result)
    flattened["data"] = rows
    return flattened


# -- 2.0 元数据子命令 --


def cmd_list_events(args):
    """列出项目下所有事件（物理/衍生/虚拟），支持关键字过滤。"""
    result = evtapi_get(args, "meta/listMetaEvent", emit=False)

    keywords = getattr(args, "keyword", None) or []
    min_recent = getattr(args, "min_recent", None)
    if keywords or min_recent is not None:
        result = _flatten_event_groups(result)
        rows = result.get("data") if isinstance(result, dict) else None
        if isinstance(rows, list):
            kws = [k.lower() for k in keywords if k]

            def _hit(item):
                if not isinstance(item, dict):
                    return False
                if min_recent is not None:
                    rec = item.get("recentlyDataNum") or 0
                    if rec < min_recent:
                        return False
                if not kws:
                    return True
                hay = str(item.get("eventName", "")).lower() + " " + str(item.get("eventDesc", "")).lower()
                return any(k in hay for k in kws)

            result["data"] = [r for r in rows if _hit(r)]
            result["_filtered"] = {
                "keywords": keywords,
                "min_recent": min_recent,
                "matched": len(result["data"]),
            }
    elif getattr(args, "flat", False):
        result = _flatten_event_groups(result)
    output(result)


def cmd_list_props(args):
    """列出指定表类型的属性列表。"""
    evtapi_get(args, "meta/listMetaProp", {"tableType": str(args.table_type)})


# -- 2.0 物理事件 / 属性写命令 --


def _validate_physical_metadata_name(value: str, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not PHYSICAL_METADATA_NAME_PATTERN.fullmatch(normalized):
        raise ValueError(f"{field_name}必须以英文字母开头，只能包含字母、数字、下划线，长度 2-100 个字符")
    return normalized


def _validate_physical_metadata_text(
    value: str | None,
    field_name: str,
    *,
    required: bool = False,
) -> str:
    normalized = str(value or "").strip()
    if required and not normalized:
        raise ValueError(f"{field_name}不能为空")
    if len(normalized) > 100:
        raise ValueError(f"{field_name}不能超过 100 个字符")
    return normalized


def _parse_csv_positive_ids(raw_ids: str | None, field_name: str) -> list[int]:
    if not raw_ids:
        return []
    result: list[int] = []
    for raw_value in str(raw_ids).split(","):
        value = raw_value.strip()
        if not value or not value.isdigit() or int(value) <= 0:
            raise ValueError(f"{field_name}只接受逗号分隔的正整数 ID")
        parsed = int(value)
        if parsed not in result:
            result.append(parsed)
    return result


def _physical_metadata_type_pairs(args: Any) -> set[tuple[str, str]]:
    result = evtapi_get(args, "meta/getSelectAndColumnTypeMap", emit=False)
    rows = _unwrap_evtapi_data(result, "获取属性类型映射")
    if not isinstance(rows, list):
        raise ValueError("获取属性类型映射返回格式异常")
    pairs = {
        (str(row.get("columnType")), str(row.get("selectType")))
        for row in rows
        if isinstance(row, dict) and row.get("columnType") and row.get("selectType")
    }
    if not pairs:
        raise ValueError("属性类型映射为空")
    return pairs


def _validate_physical_property_type(args: Any, column_type: str, select_type: str) -> None:
    pairs = _physical_metadata_type_pairs(args)
    if (column_type, select_type) in pairs:
        return
    allowed = ", ".join(f"{storage}/{analysis}" for storage, analysis in sorted(pairs))
    raise ValueError(f"不支持的 columnType/selectType 组合 {column_type}/{select_type}；可选: {allowed}")


def _physical_property_catalog(args: Any) -> dict[int, dict[str, Any]]:
    result = evtapi_get(args, "meta/listMetaEventProp", emit=False)
    rows = _unwrap_evtapi_data(result, "获取事件属性列表")
    if not isinstance(rows, list):
        raise ValueError("获取事件属性列表返回格式异常")
    return {
        int(row["propId"]): row
        for row in rows
        if isinstance(row, dict) and str(row.get("propId", "")).isdigit()
    }


def _resolve_physical_property_ids(args: Any, raw_prop_ids: str | None) -> list[int]:
    prop_ids = _parse_csv_positive_ids(raw_prop_ids, "--prop-ids")
    if not prop_ids:
        return []
    catalog = _physical_property_catalog(args)
    missing = [prop_id for prop_id in prop_ids if prop_id not in catalog]
    if missing:
        missing_text = ", ".join(str(prop_id) for prop_id in missing)
        raise ValueError(f"以下属性 ID 不在 meta/listMetaEventProp 返回结果中: {missing_text}")
    return prop_ids


def _physical_event_payload(args: Any, *, event_id: int | None = None) -> dict[str, str]:
    payload = {
        "eventName": _validate_physical_metadata_name(args.event_name, "事件名"),
        "eventDesc": _validate_physical_metadata_text(args.event_desc, "事件显示名", required=True),
        "dataSwitch": args.data_switch,
        "status": args.status,
        "remark": _validate_physical_metadata_text(args.remarks, "事件说明"),
        "propIds": ",".join(str(prop_id) for prop_id in _resolve_physical_property_ids(args, args.prop_ids)),
    }
    if event_id is not None:
        payload["eventId"] = str(event_id)
    return payload


def _event_detail(args: Any, event_id: int) -> dict[str, Any]:
    result = evtapi_get(args, "meta/metaEventDetail", {"eventId": str(event_id)}, emit=False)
    detail = _unwrap_evtapi_data(result, "获取事件详情")
    if not isinstance(detail, dict):
        raise ValueError("获取事件详情返回格式异常")
    return detail


def _event_detail_prop_ids(detail: dict[str, Any]) -> list[int]:
    prop_ids: list[int] = []
    for field_name in ("presetProp", "customProp"):
        rows = detail.get(field_name)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or not str(row.get("propId", "")).isdigit():
                continue
            prop_id = int(row["propId"])
            if prop_id not in prop_ids:
                prop_ids.append(prop_id)
    return prop_ids


def _validate_preset_metadata_edit_allowed(args: Any, metadata_type: Any, resource_name: str) -> None:
    if str(metadata_type) != "preset":
        return
    if str(args.project_id) in PRESET_METADATA_EDIT_BLOCKED_PROJECT_IDS:
        raise ValueError(f"当前项目不允许修改预置{resource_name}")


def cmd_event_save(args: Any) -> None:
    """新增物理自定义事件，并可关联已存在的物理事件属性。"""
    try:
        payload = _physical_event_payload(args)
        result = evtapi_post(args, "meta/addMetaEvent", payload, emit=False)
        data = _unwrap_evtapi_data(result, "新增事件")
        event_id = data.get("eventId") if isinstance(data, dict) else None
        if event_id is None:
            raise ValueError("新增事件成功响应缺少 eventId")
        output(
            {
                "action": "created",
                "project_id": int(args.project_id),
                "event_id": event_id,
                "event": payload,
            }
        )
    except (TypeError, ValueError) as error:
        output({"error": True, "code": "event_metadata_invalid", "message": str(error)})


def cmd_event_edit(args: Any) -> None:
    """修改物理事件的显示名、状态、说明和属性关联；事件名不可修改。"""
    try:
        detail = _event_detail(args, args.event_id)
        if str(detail.get("metaEventType")) == "virtual" or str(detail.get("eventName", "")).startswith("#ve@"):
            raise ValueError("event_edit 只支持物理事件，不支持虚拟事件")
        _validate_preset_metadata_edit_allowed(args, detail.get("metaEventType"), "事件")

        prop_ids = args.prop_ids
        if prop_ids is None:
            prop_ids = ",".join(str(prop_id) for prop_id in _event_detail_prop_ids(detail))
        payload_args = type(
            "PhysicalEventEditArgs",
            (),
            {
                "event_name": detail.get("eventName"),
                "event_desc": args.event_desc if args.event_desc is not None else detail.get("eventDesc"),
                "data_switch": args.data_switch if args.data_switch is not None else detail.get("dataSwitch") or "on",
                "status": args.status if args.status is not None else detail.get("status") or "display",
                "remarks": args.remarks if args.remarks is not None else detail.get("remark") or "",
                "prop_ids": prop_ids,
            },
        )()
        payload = _physical_event_payload(payload_args, event_id=args.event_id)
        _unwrap_evtapi_data(
            evtapi_post(args, "meta/editMetaEvent", payload, emit=False),
            "修改事件",
        )
        output(
            {
                "action": "updated",
                "project_id": int(args.project_id),
                "event_id": args.event_id,
                "event": payload,
                "preserved_existing_prop_ids": args.prop_ids is None,
            }
        )
    except (TypeError, ValueError) as error:
        output({"error": True, "code": "event_metadata_invalid", "message": str(error)})


def _physical_property_payload(args: Any, *, prop_id: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "tableType": args.table_type,
        "columnType": args.column_type,
        "columnName": _validate_physical_metadata_name(args.column_name, "属性名"),
        "columnDesc": _validate_physical_metadata_text(args.column_desc, "属性显示名", required=True),
        "dataSwitch": args.data_switch,
        "status": args.status,
        "selectType": args.select_type,
        "unit": _validate_physical_metadata_text(args.unit, "单位"),
        "remark": _validate_physical_metadata_text(args.remarks, "属性说明"),
        "metaPropType": "custom",
    }
    if prop_id is not None:
        payload["propId"] = prop_id
    return payload


def _physical_property_detail(args: Any, prop_id: int) -> dict[str, Any]:
    result = evtapi_get(args, "meta/metaPropDetail", {"propId": str(prop_id)}, emit=False)
    detail = _unwrap_evtapi_data(result, "获取属性详情")
    if not isinstance(detail, dict):
        raise ValueError("获取属性详情返回格式异常")
    return detail


def cmd_property_save(args: Any) -> None:
    """新增物理自定义属性。"""
    try:
        _validate_physical_property_type(args, args.column_type, args.select_type)
        payload = _physical_property_payload(args)
        prop_json = _frontend_encode_json(payload)
        data = _unwrap_evtapi_data(
            evtapi_post(args, "meta/addMetaProp", {"propJson": prop_json}, emit=False),
            "新增属性",
        )
        prop_ids = data if isinstance(data, dict) else None
        if not prop_ids:
            raise ValueError("新增属性成功响应缺少属性 ID")
        output(
            {
                "action": "created",
                "project_id": int(args.project_id),
                "prop_ids": prop_ids,
                "property": payload,
            }
        )
    except (TypeError, ValueError) as error:
        output({"error": True, "code": "property_metadata_invalid", "message": str(error)})


def cmd_property_edit(args: Any) -> None:
    """修改物理属性的显示名、单位、状态和说明；名称、类型、主体不可修改。"""
    try:
        detail = _physical_property_detail(args, args.prop_id)
        if detail.get("virtualType") not in (None, "") or str(detail.get("columnName", "")).startswith("#vp@"):
            raise ValueError("property_edit 只支持物理属性，不支持虚拟属性或维度属性")
        _validate_preset_metadata_edit_allowed(args, detail.get("metaPropType"), "属性")

        required_fields = ("tableType", "columnType", "columnName", "selectType")
        missing = [field for field in required_fields if detail.get(field) in (None, "")]
        if missing:
            raise ValueError(f"属性详情缺少不可变字段: {', '.join(missing)}")
        payload_args = type(
            "PhysicalPropertyEditArgs",
            (),
            {
                "table_type": int(detail["tableType"]),
                "column_type": str(detail["columnType"]),
                "column_name": str(detail["columnName"]),
                "column_desc": args.column_desc if args.column_desc is not None else detail.get("columnDesc"),
                "data_switch": args.data_switch if args.data_switch is not None else detail.get("dataSwitch") or "on",
                "status": args.status if args.status is not None else detail.get("status") or "display",
                "select_type": str(detail["selectType"]),
                "unit": args.unit if args.unit is not None else detail.get("unit") or "",
                "remarks": args.remarks if args.remarks is not None else detail.get("remark") or "",
            },
        )()
        payload = _physical_property_payload(payload_args, prop_id=args.prop_id)
        prop_json = _frontend_encode_json(payload)
        _unwrap_evtapi_data(
            evtapi_post(args, "meta/editMetaProp", {"propJson": prop_json}, emit=False),
            "修改属性",
        )
        output(
            {
                "action": "updated",
                "project_id": int(args.project_id),
                "prop_id": args.prop_id,
                "property": payload,
            }
        )
    except (TypeError, ValueError) as error:
        output({"error": True, "code": "property_metadata_invalid", "message": str(error)})


def _unwrap_evtapi_data(result: Any, operation: str) -> Any:
    if not isinstance(result, dict):
        raise ValueError(f"{operation}返回格式异常")
    if result.get("error"):
        raise ValueError(f"{operation}失败: {result.get('message') or result}")

    return_code = result.get("return_code", result.get("returnCode"))
    if return_code is not None:
        if str(return_code) != "0":
            message = result.get("return_message") or result.get("returnMessage") or result
            raise ValueError(f"{operation}失败: {message}")
        return result.get("data")
    return result


def _parse_virtual_property_event_ids(raw_event_ids: str | None) -> list[int]:
    if not raw_event_ids:
        return []
    result: list[int] = []
    for raw_value in raw_event_ids.split(","):
        value = raw_value.strip()
        if not value or not value.isdigit() or int(value) <= 0:
            raise ValueError("--event-ids 只接受逗号分隔的正整数事件 ID")
        event_id = int(value)
        if event_id not in result:
            result.append(event_id)
    return result


def _normalize_virtual_property_name(raw_name: str) -> str:
    name = raw_name.strip()
    if not name.startswith("#vp@"):
        name = f"#vp@{name}"
    if not VIRTUAL_PROPERTY_NAME_PATTERN.fullmatch(name):
        raise ValueError("虚拟属性名必须为 #vp@ 加 1-96 位字母、数字或下划线")
    return name


def _validate_virtual_property_text(value: str, field_name: str, *, required: bool = False) -> str:
    normalized = value.strip()
    if required and not normalized:
        raise ValueError(f"{field_name}不能为空")
    if len(normalized) > 100:
        raise ValueError(f"{field_name}不能超过 100 个字符")
    return normalized


def _build_virtual_property_payload(args: Any) -> tuple[dict[str, Any], list[int]]:
    column_name = _normalize_virtual_property_name(args.column_name)
    column_desc = _validate_virtual_property_text(args.column_desc, "显示名", required=True)
    unit = _validate_virtual_property_text(args.unit or "", "单位")
    remark = _validate_virtual_property_text(args.remarks or "", "说明")
    column_rule = str(args.column_rule or "").strip()
    if not column_rule:
        raise ValueError("SQL 表达式不能为空")

    type_pair = (args.column_type, args.select_type)
    if type_pair not in VIRTUAL_PROPERTY_TYPE_PAIRS:
        allowed = ", ".join(
            f"{column_type}/{select_type}" for column_type, select_type in sorted(VIRTUAL_PROPERTY_TYPE_PAIRS)
        )
        raise ValueError(f"不支持的 columnType/selectType 组合 {type_pair[0]}/{type_pair[1]}；可选: {allowed}")

    event_ids = _parse_virtual_property_event_ids(args.event_ids)
    payload: dict[str, Any] = {
        "tableType": args.table_type,
        "metaPropType": "custom",
        "columnName": column_name,
        "columnDesc": column_desc,
        "columnType": args.column_type,
        "selectType": args.select_type,
        "unit": unit,
        "remark": remark,
        "columnRule": column_rule,
        "status": args.status,
        "virtualType": 1,
    }

    if args.table_type == 0:
        relation_type = 0 if args.relation_type is None else args.relation_type
        relation_table_type = 0 if args.relation_table_type is None else args.relation_table_type
        if relation_type == 2 and not event_ids:
            raise ValueError("事件虚拟属性使用 --relation-type 2 时必须提供 --event-ids")
        if relation_type != 2 and event_ids:
            raise ValueError("--event-ids 只能与 --relation-type 2 一起使用")
        payload["relationType"] = relation_type
        payload["relationTableType"] = relation_table_type
    elif args.relation_type is not None or args.relation_table_type is not None or event_ids:
        raise ValueError("账号/设备虚拟属性不支持事件关联参数")

    return payload, event_ids


def _resolve_virtual_property_events(args: Any, event_ids: list[int]) -> list[dict[str, Any]]:
    result = evtapi_get(args, "virtualMeta/listMetaEvent", emit=False)
    events = _unwrap_evtapi_data(result, "获取虚拟属性可关联事件")
    if not isinstance(events, list):
        raise ValueError("获取虚拟属性可关联事件返回格式异常")

    events_by_id: dict[int, dict[str, Any]] = {}
    for event in events:
        if not isinstance(event, dict):
            continue
        raw_event_id = event.get("eventId")
        if raw_event_id is None or not str(raw_event_id).isdigit():
            continue
        events_by_id[int(raw_event_id)] = event

    missing = [event_id for event_id in event_ids if event_id not in events_by_id]
    if missing:
        missing_text = ", ".join(str(event_id) for event_id in missing)
        raise ValueError(f"以下事件 ID 不在 virtualMeta/listMetaEvent 返回结果中: {missing_text}")
    return [events_by_id[event_id] for event_id in event_ids]


def _virtual_property_validation_summary(inspect_data: dict[str, Any]) -> dict[str, Any]:
    dependencies = inspect_data.get("data")
    return {
        "dependencies": dependencies if isinstance(dependencies, list) else [],
        "trino_sql": inspect_data.get("trinoSql"),
        "starrocks_sql": inspect_data.get("starrocksSql"),
    }


def cmd_virtual_property_save(args: Any) -> None:
    """校验并创建计算虚拟属性；dry-run 只执行 SQL 校验。"""
    try:
        payload, event_ids = _build_virtual_property_payload(args)
        if event_ids:
            payload["events"] = _resolve_virtual_property_events(args, event_ids)

        prop_json = _frontend_encode_json(payload)
        inspect_result = evtapi_post(
            args,
            "virtualMeta/sqlInspect",
            {"propJson": prop_json},
            emit=False,
        )
        inspect_data = _unwrap_evtapi_data(inspect_result, "虚拟属性 SQL 校验")
        if not isinstance(inspect_data, dict):
            raise ValueError("虚拟属性 SQL 校验返回格式异常")
        if str(inspect_data.get("status")) != "1":
            raise ValueError(f"虚拟属性 SQL 校验失败: {inspect_data.get('data') or inspect_data}")

        validation = _virtual_property_validation_summary(inspect_data)
        if args.dry_run:
            output(
                {
                    "action": "validated",
                    "dry_run": True,
                    "project_id": int(args.project_id),
                    "virtual_property": payload,
                    "validation": validation,
                }
            )
            return

        save_result = evtapi_post(
            args,
            "virtualMeta/addMetaProp",
            {"propJson": prop_json},
            emit=False,
        )
        save_data = _unwrap_evtapi_data(save_result, "创建虚拟属性")
        v_prop_id = save_data.get("vPropId") if isinstance(save_data, dict) else None
        if v_prop_id is None:
            raise ValueError("创建虚拟属性成功响应缺少 vPropId")
        output(
            {
                "action": "created",
                "project_id": int(args.project_id),
                "v_prop_id": v_prop_id,
                "virtual_property": payload,
                "validation": validation,
            }
        )
    except (TypeError, ValueError) as error:
        output(
            {
                "error": True,
                "code": "virtual_property_invalid",
                "message": str(error),
            }
        )


def _event_identity(event):
    event_id = event.get("eventId")
    event_name = event.get("eventName")
    if event_id is not None and event_id != "":
        return f"id:{event_id}"
    if event_name:
        return f"name:{event_name}"
    return ""


def _event_display_name(event):
    return event.get("eventNameDisplay") or event.get("eventDesc") or event.get("eventName") or "<unknown>"


def _normalize_prop_name(prop):
    return prop.get("quota") or prop.get("columnName")


def _extract_quota_groups(result):
    data = result.get("data") if isinstance(result, dict) else None
    if isinstance(data, dict) and isinstance(data.get("quotas"), dict):
        return data["quotas"]
    if isinstance(result, dict) and isinstance(result.get("quotas"), dict):
        return result["quotas"]
    return {}


def _extract_event_properties(result):
    data = result.get("data") if isinstance(result, dict) else None
    if isinstance(data, dict) and isinstance(data.get("properties"), list):
        return data["properties"]
    if isinstance(result, dict) and isinstance(result.get("properties"), list):
        return result["properties"]
    if isinstance(data, list):
        return data
    return []


def _extract_event_catalog_rows(result):
    """Extract event rows from the grouped payload returned by meta/listMetaEvent."""
    if not isinstance(result, (dict, list)):
        return []
    if isinstance(result, dict) and result.get("error"):
        raise ValueError(f"获取事件元数据失败: {result.get('message') or result}")

    payload = result.get("data", result) if isinstance(result, dict) else result
    rows = []

    def collect(value):
        if isinstance(value, list):
            for item in value:
                collect(item)
            return
        if not isinstance(value, dict):
            return
        if value.get("eventId") not in (None, "") or value.get("eventName"):
            rows.append(value)
            return
        for item in value.values():
            collect(item)

    collect(payload)
    return rows


def _same_catalog_event(left, right):
    return str(left.get("eventId")) == str(right.get("eventId")) and left.get("eventName") == right.get(
        "eventName"
    )


def _fetch_event_catalog(args):
    """Fetch the canonical event identity triplets used by report/editor payloads."""
    result = evtapi_get(args, "meta/listMetaEvent", emit=False)
    rows = _extract_event_catalog_rows(result)
    if not rows:
        raise ValueError("获取事件元数据失败: meta/listMetaEvent 未返回事件")

    events_by_id = {}
    events_by_name = {}
    for row in rows:
        event_id = row.get("eventId")
        event_name = row.get("eventName")
        if event_id not in (None, ""):
            key = str(event_id)
            existing = events_by_id.get(key)
            if existing and not _same_catalog_event(existing, row):
                raise ValueError(f"事件元数据冲突: eventId `{event_id}` 对应多个事件")
            events_by_id[key] = row
        if event_name:
            existing = events_by_name.get(event_name)
            if existing and not _same_catalog_event(existing, row):
                raise ValueError(f"事件元数据冲突: eventName `{event_name}` 对应多个事件")
            events_by_name[event_name] = row

    if not events_by_id and not events_by_name:
        raise ValueError("获取事件元数据失败: 没有可识别的 eventId/eventName")
    return {"eventsById": events_by_id, "eventsByName": events_by_name}


def _resolve_catalog_event(event, metadata, *, field_name="event"):
    if not isinstance(event, dict):
        raise ValueError(f"{field_name} 必须是 JSON 对象")

    event_id = event.get("eventId")
    event_name = event.get("eventName")
    has_event_id = event_id not in (None, "")
    has_event_name = bool(event_name)
    if not has_event_id and not has_event_name:
        raise ValueError(f"{field_name} 缺少 eventId/eventName，无法从 list_events 解析")

    events_by_id = metadata.get("eventsById") or {}
    events_by_name = metadata.get("eventsByName") or {}
    by_id = events_by_id.get(str(event_id)) if has_event_id else None
    by_name = events_by_name.get(event_name) if has_event_name else None
    if has_event_id and by_id is None:
        raise ValueError(f"{field_name} 的 eventId `{event_id}` 不在 list_events 返回结果中")
    if has_event_name and by_name is None:
        raise ValueError(f"{field_name} 的 eventName `{event_name}` 不在 list_events 返回结果中")
    if by_id is not None and by_name is not None and not _same_catalog_event(by_id, by_name):
        raise ValueError(
            f"{field_name} 的 eventId `{event_id}` 与 eventName `{event_name}` 不属于同一事件"
        )

    resolved = by_id or by_name
    resolved_id = resolved.get("eventId")
    resolved_name = resolved.get("eventName")
    resolved_desc = str(resolved.get("eventDesc") or "").strip()
    if resolved_id in (None, "") or not resolved_name or not resolved_desc:
        raise ValueError(
            f"{field_name} 在 list_events 中缺少完整 eventId/eventName/eventDesc；停止写入以避免前端事件名为空"
        )
    return resolved


def _canonical_event_ref(event):
    return {
        "eventId": event.get("eventId"),
        "eventName": event.get("eventName"),
        "eventDesc": str(event.get("eventDesc") or "").strip(),
    }


def _is_formula_event(event):
    return event.get("type") == 1 or bool(event.get("customEvent"))


def _enrich_event_qp_metadata(qp_obj, metadata):
    """Canonicalize every report event before reportRestore is generated or preserved."""
    if not isinstance(qp_obj, dict):
        raise ValueError("report qp 必须是 JSON 对象")
    events = qp_obj.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError("event 模型 report qp 必须包含非空 events 数组")

    for index, event in enumerate(events):
        if not isinstance(event, dict):
            raise ValueError(f"events[{index}] 必须是 JSON 对象")
        if _is_formula_event(event):
            formula_name = str(event.get("eventDesc") or event.get("eventNameDisplay") or "").strip()
            if not formula_name:
                raise ValueError(f"events[{index}] 自定义公式缺少 eventDesc 展示名")
            event["eventDesc"] = formula_name
            operands = _split_formula_operands(event.get("customEvent", ""))
            if not operands:
                raise ValueError(f"events[{index}] 自定义公式未解析出事件指标")
            for operand in operands:
                _resolve_catalog_event(
                    {"eventName": operand.get("eventName")},
                    metadata,
                    field_name=f"events[{index}] formula operand",
                )
            continue

        resolved = _resolve_catalog_event(event, metadata, field_name=f"events[{index}]")
        event.update(_canonical_event_ref(resolved))
    return qp_obj


def _metric_desc(quota_groups, metric, group=None):
    if group and isinstance(quota_groups.get(group), dict) and metric in quota_groups[group]:
        return quota_groups[group][metric]
    for grouped in quota_groups.values():
        if isinstance(grouped, dict) and metric in grouped:
            return grouped[metric]
    return metric


def _metric_groups(quota_groups, metric):
    groups = []
    for group, grouped in quota_groups.items():
        if isinstance(grouped, dict) and metric in grouped:
            groups.append(group)
    return groups


def _property_group(prop):
    raw_type = str(prop.get("selectType") or prop.get("columnType") or "").lower()
    if raw_type in NUMBER_PROP_TYPES:
        return "number"
    if raw_type in STRING_PROP_TYPES:
        return "string"
    if raw_type in DATETIME_PROP_TYPES:
        return "datetime"
    if raw_type in BOOL_PROP_TYPES:
        return "bool"
    if raw_type in ARRAY_STRING_PROP_TYPES:
        return "array_string"
    return raw_type


def _fetch_event_quotas(args, event_model="event"):
    result = evtapi_get(args, "event/quotas", {"eventModel": event_model}, emit=False)
    if isinstance(result, dict) and result.get("error"):
        raise ValueError(f"获取 event quotas 失败: {result.get('message') or result}")
    quota_groups = _extract_quota_groups(result)
    if not quota_groups:
        raise ValueError("获取 event quotas 失败: 响应中没有 data.quotas")
    return quota_groups


def _fetch_event_properties(args, event, event_model="event"):
    params = {"eventModel": event_model}
    event_id = event.get("eventId")
    event_name = event.get("eventName")
    if event_id is not None and event_id != "":
        params["eventIds"] = str(event_id)
    elif event_name:
        params["eventNames"] = str(event_name)
    else:
        raise ValueError("获取 event properties 失败: 缺少 eventId/eventName")
    result = evtapi_get(args, "event/properties", params, emit=False)
    if isinstance(result, dict) and result.get("error"):
        raise ValueError(f"获取 event properties 失败 ({event_name or event_id}): {result.get('message') or result}")
    properties = _extract_event_properties(result)
    props_by_name = {}
    for prop in properties:
        if not isinstance(prop, dict):
            continue
        prop_name = _normalize_prop_name(prop)
        if prop_name:
            props_by_name[prop_name] = prop
    return props_by_name


def _collect_events_for_metadata(qp_obj):
    events = qp_obj.get("events") or []
    collected = {}
    for event in events:
        if not isinstance(event, dict):
            continue
        if event.get("eventName") or event.get("eventId") is not None:
            key = _event_identity(event)
            if key:
                collected[key] = event
        if event.get("type") == 1 or event.get("customEvent"):
            for operand in _split_formula_operands(event.get("customEvent", "")):
                event_name = operand.get("eventName")
                if event_name:
                    collected.setdefault(f"name:{event_name}", {"eventName": event_name})
    return list(collected.values())


def _metadata_context(args, qp_obj, event_model="event", event_catalog=None):
    event_catalog = event_catalog or _fetch_event_catalog(args)
    quota_groups = _fetch_event_quotas(args, event_model)
    props_by_event = {}
    for event in _collect_events_for_metadata(qp_obj):
        key = _event_identity(event)
        if not key:
            continue
        props_by_event[key] = _fetch_event_properties(args, event, event_model)
    return {**event_catalog, "quotaGroups": quota_groups, "propsByEvent": props_by_event}


def _props_for_event(metadata, event):
    props_by_event = metadata.get("propsByEvent") or {}
    for key in (_event_identity(event), f"name:{event.get('eventName')}"):
        if key in props_by_event:
            return props_by_event[key]
    return {}


def _prop_for_metric_event(metadata, event, quota):
    if not quota:
        return None
    return _props_for_event(metadata, event).get(quota)


def _validate_event_metric(event, metadata, *, field_name="event"):
    quota_groups = metadata["quotaGroups"]
    metric = event.get("analysis")
    label = _event_display_name(event)
    if not metric:
        raise ValueError(f"{field_name} `{label}` 缺少 analysis")

    metric_groups = _metric_groups(quota_groups, metric)
    if not metric_groups:
        raise ValueError(f"{field_name} `{label}` 的 analysis `{metric}` 不在 /event/quotas 返回结果中")

    quota = event.get("quota")
    if STAID_QUOTA_GROUP in metric_groups:
        if quota:
            raise ValueError(f"{field_name} `{label}` 的事件级指标 `{metric}` 不应同时指定属性 quota `{quota}`")
        event["analysisDesc"] = _metric_desc(quota_groups, metric, STAID_QUOTA_GROUP)
        event.pop("quota", None)
        event.pop("quotaDesc", None)
        return

    if not quota:
        raise ValueError(f"{field_name} `{label}` 的属性聚合指标 `{metric}` 必须指定 quota 属性")

    prop = _prop_for_metric_event(metadata, event, quota)
    if not prop:
        raise ValueError(f"{field_name} `{label}` 指定的属性 quota `{quota}` 不在该事件 /event/properties 中")

    prop_group = _property_group(prop)
    if prop_group not in quota_groups or metric not in quota_groups[prop_group]:
        raise ValueError(f"{field_name} `{label}` 的指标 `{metric}` 不适用于属性 `{quota}` 的类型 `{prop_group}`")

    event["analysisDesc"] = _metric_desc(quota_groups, metric, prop_group)
    event["quotaDesc"] = prop.get("quotaDesc") or prop.get("columnDesc") or quota


def _validate_formula_metric(operand, metadata):
    event = {"eventName": operand.get("eventName"), "analysis": operand.get("metric")}
    if operand.get("quota"):
        event["quota"] = operand.get("quota")
    _validate_event_metric(event, metadata, field_name="formula operand")


def _validate_event_qp_metadata(qp_obj, metadata):
    events = qp_obj.get("events") or []
    for event in events:
        if not isinstance(event, dict):
            continue
        if event.get("type") == 1 or event.get("customEvent"):
            for operand in _split_formula_operands(event.get("customEvent", "")):
                _validate_formula_metric(operand, metadata)
            continue
        _validate_event_metric(event, metadata)
    return qp_obj


def _prepare_report_qp(args, *, report_model, rebuild_report_restore=False, validate_metadata=True):
    qp_obj = _normalize_event_qp(json.loads(args.qp))
    metadata = None
    if report_model == "event":
        event_catalog = _fetch_event_catalog(args)
        _enrich_event_qp_metadata(qp_obj, event_catalog)
        metadata = event_catalog
        if validate_metadata:
            metadata = _metadata_context(args, qp_obj, report_model, event_catalog=event_catalog)
            _validate_event_qp_metadata(qp_obj, metadata)
    should_rebuild_restore = "reportRestore" not in qp_obj or (report_model == "event" and rebuild_report_restore)
    if should_rebuild_restore:
        qp_obj["reportRestore"] = _build_report_restore(qp_obj, metadata)
    elif report_model == "event":
        _sync_report_restore_time_grouping(qp_obj)
    if report_model == "event":
        _sync_report_restore_event_metadata(qp_obj, metadata)
    return qp_obj


def cmd_event_quotas(args):
    """获取事件分析可用指标（/event/quotas）。"""
    evtapi_get(args, "event/quotas", {"eventModel": args.event_model})


def cmd_event_properties(args):
    """获取指定事件可用属性（/event/properties）。"""
    if not getattr(args, "event_ids", None) and not getattr(args, "event_names", None):
        output(
            {
                "error": True,
                "code": "missing_event_selector",
                "message": "event_properties 必须传 --event-ids 或 --event-names。",
            }
        )
        return
    params = {"eventModel": args.event_model}
    if getattr(args, "event_ids", None):
        params["eventIds"] = args.event_ids
    if getattr(args, "event_names", None):
        params["eventNames"] = args.event_names
    if getattr(args, "subject", None):
        params["subject"] = args.subject
    evtapi_get(args, "event/properties", params)


def cmd_list_clusters(args):
    """列出用户分群列表。"""
    evtapi_get(args, "cluster/list")


def cmd_cluster_save(args):
    """新增用户分群。"""
    fields = {
        "clusterName": args.cluster_name,
        "refreshType": str(args.refresh_type),
    }
    if getattr(args, "display_name", None):
        fields["displayName"] = args.display_name
    if getattr(args, "remarks", None):
        fields["remarks"] = args.remarks
    if getattr(args, "subject", None):
        fields["subject"] = args.subject
    if getattr(args, "qp", None):
        try:
            normalized_qp = _normalize_cluster_qp(args.qp)
            if normalized_qp is not None:
                fields["qp"] = normalized_qp
        except ValueError as e:
            output({"error": True, "message": str(e)})
            return
    if getattr(args, "file_path", None):
        fields["filePath"] = args.file_path
    if getattr(args, "timezone", None):
        fields["timezone"] = args.timezone
    evtapi_post(args, "cluster/save", fields)


def cmd_cluster_edit(args):
    """编辑用户分群。"""
    fields = {
        "clusterId": str(args.cluster_id),
        "refreshType": str(args.refresh_type),
    }
    if getattr(args, "display_name", None):
        fields["displayName"] = args.display_name
    if getattr(args, "remarks", None):
        fields["remarks"] = args.remarks
    if getattr(args, "subject", None):
        fields["subject"] = args.subject
    if getattr(args, "qp", None):
        try:
            normalized_qp = _normalize_cluster_qp(args.qp)
            if normalized_qp is not None:
                fields["qp"] = normalized_qp
        except ValueError as e:
            output({"error": True, "message": str(e)})
            return
    if getattr(args, "file_path", None):
        fields["filePath"] = args.file_path
    evtapi_post(args, "cluster/edit", fields)


def cmd_list_tags(args):
    """列出用户标签列表。"""
    result = evtapi_get(args, "userTag/list", emit=False)
    rows = result.get("data") if isinstance(result, dict) else None
    keyword = (getattr(args, "keyword", None) or "").lower()
    tag_type = getattr(args, "tag_type", None)
    subject = getattr(args, "subject", None)
    cluster_name = getattr(args, "cluster_name", None)
    if isinstance(rows, list) and (keyword or tag_type or subject or cluster_name):

        def _hit(row):
            if not isinstance(row, dict):
                return False
            if tag_type and row.get("tagType") != tag_type:
                return False
            if subject and row.get("subject") != subject:
                return False
            if cluster_name and row.get("clusterName") != cluster_name:
                return False
            if keyword:
                hay = (
                    str(row.get("clusterName", "")).lower()
                    + " "
                    + str(row.get("displayName", "")).lower()
                    + " "
                    + str(row.get("remarks", "")).lower()
                )
                return keyword in hay
            return True

        result["data"] = [row for row in rows if _hit(row)]
        result["_filtered"] = {
            "keyword": getattr(args, "keyword", None),
            "tag_type": tag_type,
            "subject": subject,
            "cluster_name": cluster_name,
            "matched": len(result["data"]),
        }
    output(result)


def cmd_tag_info(args):
    """查询用户标签详情。"""
    evtapi_get(args, "userTag/info", {"clusterId": str(args.cluster_id)})


def cmd_tag_save(args):
    """新增用户标签。"""
    fields = {
        "tagType": args.tag_type,
        "clusterName": args.cluster_name,
        "refreshType": str(args.refresh_type),
    }
    if getattr(args, "display_name", None):
        fields["displayName"] = args.display_name
    if getattr(args, "remarks", None):
        fields["remarks"] = args.remarks
    if getattr(args, "subject", None):
        fields["subject"] = args.subject
    if getattr(args, "qp", None):
        try:
            fields["qp"] = _normalize_tag_qp(args.qp, args.tag_type)
        except ValueError as e:
            output({"error": True, "message": str(e)})
            return
    if getattr(args, "file_path", None):
        fields["filePath"] = args.file_path
    evtapi_post(args, "userTag/save", fields)


def cmd_tag_edit(args):
    """编辑用户标签。"""
    fields = {
        "clusterId": str(args.cluster_id),
    }
    if getattr(args, "display_name", None) is not None:
        fields["displayName"] = args.display_name
    if getattr(args, "refresh_type", None) is not None:
        fields["refreshType"] = str(args.refresh_type)
    if getattr(args, "remarks", None) is not None:
        fields["remarks"] = args.remarks
    if getattr(args, "qp", None):
        try:
            normalized_qp = _normalize_tag_qp(args.qp, getattr(args, "tag_type", None))
            if normalized_qp is not None:
                fields["qp"] = normalized_qp
        except ValueError as e:
            output({"error": True, "message": str(e)})
            return
    else:
        detail = evtapi_get(
            args,
            "userTag/info",
            {"clusterId": str(args.cluster_id)},
            emit=False,
        )
        try:
            existing_qp = _tag_qp_from_detail(detail, getattr(args, "tag_type", None))
        except ValueError as e:
            output(
                {
                    "error": True,
                    "code": "tag_qp_reuse_failed",
                    "message": f"无法安全复用现有标签 qp，已停止编辑：{e}",
                    "hint": "请先运行 tag_info 检查标签详情，或显式传入完整 --qp。",
                }
            )
            return
        if existing_qp is not None:
            fields["qp"] = existing_qp
    if getattr(args, "file_path", None):
        fields["filePath"] = args.file_path
    evtapi_post(args, "userTag/edit", fields)


# -- 2.0 看板子命令 --


def cmd_folder_list(args):
    """获取看板文件夹列表，每个看板自动附带可点击的 url 字段。"""
    result = evtapi_get(args, "dashboard/folderList", emit=False)

    # 为每个看板注入 url 字段
    region = (args.region or "cn").lower()
    web_base = DASHBOARD_WEB_URLS.get(region, DASHBOARD_WEB_URLS["cn"])
    project_id = args.project_id
    for folder in result.get("data") or []:
        for db in folder.get("dashboards") or []:
            did = db.get("dashboardId")
            if did is not None:
                db["url"] = f"{web_base}/{did}#project={project_id}"

    output(result)


def cmd_folder_save(args):
    """新建文件夹。"""
    fields = {
        "folderName": args.folder_name,
        "folderType": getattr(args, "folder_type", None) or "normal_folder",
    }
    evtapi_post(args, "dashboard/folderSave", fields)


def cmd_dashboard_save(args):
    """新建看板。"""
    order = getattr(args, "order_string", None) or "[]"
    fields = {
        "dashboardName": args.dashboard_name,
        "dashboardFolderId": str(args.folder_id),
        "orderString": order,
    }
    evtapi_post(args, "dashboard/dashboardSave", fields)


def _uid():
    return hashlib.md5(uuid.uuid4().bytes).hexdigest()


def _split_formula_operands(custom_expr):
    """Parse custom formula operands.

    Supported forms:
    - event.metric                         e.g. user_login.trig_user_num
    - event.property.metric                e.g. charge.#vp@charge_amout.sum
    - #event.metric / #event.property.sum  e.g. #ad_show.total_times
    """
    if not custom_expr:
        return []
    operators = re.findall(r"[+\-*/]", custom_expr)
    tokens = [t.strip() for t in re.split(r"[+\-*/()]", custom_expr) if t.strip()]
    operands = []
    for idx, token in enumerate(tokens):
        parts = token.split(".")
        if len(parts) < 2:
            continue
        event_name = parts[0]
        metric = parts[-1]
        quota = ".".join(parts[1:-1]) if len(parts) > 2 else None
        operands.append(
            {
                "eventName": event_name,
                "quota": quota,
                "metric": metric,
                "operator": operators[idx] if idx < len(operators) else "",
            }
        )
    return operands


def _default_event_time_group_by(event_view):
    return {
        "columnType": "timestamp",
        "tableType": 0,
        "timeTypeColumnFormat": event_view.get("timeParticleSize", DEFAULT_EVENT_TIME_PARTICLE_SIZE)
        or DEFAULT_EVENT_TIME_PARTICLE_SIZE,
        "selectType": "datetime",
        "propType": "staid_prop",
        "columnDesc": "事件发生时间",
        "columnName": EVENT_TIME_COLUMN,
    }


def _event_time_groups(event_view):
    group_by = event_view.get("groupBy")
    if not isinstance(group_by, list):
        return []
    return [group for group in group_by if isinstance(group, dict) and group.get("columnName") == EVENT_TIME_COLUMN]


def _normalize_event_time_grouping(event_view):
    """Keep event timeParticleSize consistent with the actual event-time dimension."""
    time_groups = _event_time_groups(event_view)
    if not time_groups:
        event_view["timeParticleSize"] = TOTAL_TIME_PARTICLE_SIZE
        return event_view

    time_particle_size = event_view.get("timeParticleSize")
    if time_particle_size not in EVENT_TIME_PARTICLE_SIZES:
        time_particle_size = DEFAULT_EVENT_TIME_PARTICLE_SIZE
    event_view["timeParticleSize"] = time_particle_size
    for time_group in time_groups:
        time_group["timeTypeColumnFormat"] = time_particle_size
    return event_view


def _normalize_event_qp(qp_obj):
    """Normalize event qp to avoid common backend/frontend failures."""
    if not isinstance(qp_obj, dict):
        return qp_obj
    events = qp_obj.get("events", [])
    event_view = qp_obj.get("eventView", {})
    if not isinstance(events, list) or not isinstance(event_view, dict):
        return qp_obj

    # Multi-event reports must declare splitEvents for the analysis service and editor restore.
    unique_names = list(
        dict.fromkeys(
            event.get("eventName", "")
            for event in events
            if isinstance(event, dict) and event.get("eventName")
        )
    )
    if len(unique_names) > 1 and "splitEvents" not in event_view:
        event_view["splitEvents"] = unique_names

    # splitEvents and formula reports need at least one grouping dimension; default to event time.
    has_formula = any(_is_formula_event(event) for event in events if isinstance(event, dict))
    if (event_view.get("splitEvents") is not None or has_formula) and not event_view.get("groupBy"):
        event_view["groupBy"] = [_default_event_time_group_by(event_view)]

    qp_obj["eventView"] = _normalize_event_time_grouping(event_view)
    return qp_obj


def _normalize_qp_json_arg(raw_qp):
    """Best-effort normalize JSON qp CLI argument; keep original if invalid."""
    try:
        qp_obj = _normalize_event_qp(json.loads(raw_qp))
        return json.dumps(qp_obj, ensure_ascii=False)
    except Exception:
        return raw_qp


def _report_source_events(qp_obj, metadata=None):
    """Return unique canonical events used directly or by formula operands."""
    events = qp_obj.get("events") or []
    standard_by_name = {
        event.get("eventName"): event
        for event in events
        if isinstance(event, dict) and not _is_formula_event(event) and event.get("eventName")
    }
    result = []
    seen = set()

    def append_event(event, field_name):
        if metadata:
            event = _resolve_catalog_event(event, metadata, field_name=field_name)
        event_ref = _canonical_event_ref(event)
        key = str(event_ref.get("eventId") or f"name:{event_ref.get('eventName')}")
        if key not in seen:
            seen.add(key)
            result.append(event_ref)

    for index, event in enumerate(events):
        if not isinstance(event, dict):
            continue
        if _is_formula_event(event):
            for operand in _split_formula_operands(event.get("customEvent", "")):
                event_name = operand.get("eventName")
                reference = standard_by_name.get(event_name) or {"eventName": event_name}
                append_event(reference, f"events[{index}] formula operand")
        else:
            append_event(event, f"events[{index}]")
    return result


def _build_report_restore(qp_obj, metadata=None):
    """根据 events + eventView 自动生成最小可用的 reportRestore，使前端能正确渲染。"""
    events = qp_obj.get("events", [])
    event_view = _normalize_event_time_grouping(qp_obj.get("eventView", {}))
    group_by = event_view.get("groupBy") or []
    start = event_view.get("startTime", "")
    end = event_view.get("endTime", "")
    tps = event_view.get("timeParticleSize", TOTAL_TIME_PARTICLE_SIZE)

    # correctCustom: 每个 event 指标一条
    correct_custom = []
    event_names_display = []

    # Build event lookup for resolving custom formula references.
    # event_metric_lookup preserves duplicate eventName rows with different value properties.
    event_lookup = {}
    event_metric_lookup = {}
    for ev in events:
        en = ev.get("eventName", "")
        if en and not _is_formula_event(ev):
            event_lookup[en] = ev
            event_metric_lookup[(en, ev.get("quota"), ev.get("analysis"))] = ev
            event_metric_lookup[(en, None, ev.get("analysis"))] = ev

    for ev in events:
        ename = ev.get("eventNameDisplay") or ev.get("eventDesc") or ev.get("eventName", "")
        event_names_display.append(ename)

        if ev.get("type") == 1:
            # Custom formula: type=formula with populated formulaData.items
            custom_expr = ev.get("customEvent", "")
            data_format = ev.get("dataFormat", "twoBit")
            # Parse formula operands including event.property.metric forms such as
            # charge.#vp@charge_amout.sum and #ad_show.total_times.
            operands = _split_formula_operands(custom_expr)
            # Build formula items; use the operator after the operand as rightBracket.
            formula_items = []
            for operand in operands:
                op_event = operand["eventName"]
                op_metric = operand["metric"]
                op_quota = operand.get("quota")
                ref_ev = (
                    event_metric_lookup.get((op_event, op_quota, op_metric))
                    or event_metric_lookup.get((op_event, None, op_metric))
                    or event_lookup.get(op_event, {})
                    or ((metadata or {}).get("eventsByName") or {}).get(op_event, {})
                )
                # Determine analysisDesc for the metric
                analysis_desc_map = {
                    "total_times": "总次数",
                    "trig_user_num": "触发账号数",
                    "trig_device_num": "触发设备数",
                    "trig_role_num": "触发角色数",
                    "per_capita_times": "人均次数",
                    "sum": "总和",
                    "avg": "平均值",
                    "max": "最大值",
                    "min": "最小值",
                    "median": "中位数",
                    "distinct": "去重数",
                }
                prop_quota = op_quota or op_metric
                prop_desc = ref_ev.get("quotaDesc") if ref_ev.get("quota") == op_quota else None
                if op_quota and not prop_desc and metadata:
                    prop = _prop_for_metric_event(metadata, {"eventName": op_event}, op_quota)
                    if prop:
                        prop_desc = prop.get("quotaDesc") or prop.get("columnDesc")
                quota_groups = (metadata or {}).get("quotaGroups")
                metric_desc = (
                    _metric_desc(quota_groups, op_metric)
                    if quota_groups
                    else analysis_desc_map.get(op_metric, op_metric)
                )
                quotas = {"quotas": {"quotaDesc": metric_desc, "quota": op_metric}} if op_quota else {}
                formula_items.append(
                    {
                        "identify": _uid(),
                        "rightBracket": operand.get("operator", ""),
                        "filters": {"items": [], "relation": "and"},
                        "event": {
                            "eventId": ref_ev.get("eventId"),
                            "eventDesc": ref_ev.get("eventDesc", ""),
                            "eventName": op_event,
                        },
                        "properties": {
                            "quotaDesc": prop_desc or metric_desc,
                            "quota": prop_quota,
                        },
                        **quotas,
                    }
                )

            correct_custom.append(
                {
                    "identify": _uid(),
                    "data": {
                        "identify": _uid(),
                        "name": "",
                        "filters": {"items": [], "relation": "and"},
                        "event": {
                            "eventId": formula_items[0]["event"]["eventId"] if formula_items else None,
                            "eventDesc": formula_items[0]["event"]["eventDesc"] if formula_items else "",
                            "eventName": formula_items[0]["event"]["eventName"] if formula_items else "",
                        },
                        "isShowEditName": False,
                        "properties": {
                            "quotaDesc": formula_items[0]["properties"]["quotaDesc"] if formula_items else "",
                            "quota": formula_items[0]["properties"]["quota"] if formula_items else "",
                        },
                    },
                    "type": "formula",
                    "formulaData": {
                        "unit": data_format,
                        "identify": _uid(),
                        "name": ename,
                        "filters": {"items": [], "relation": "and"},
                        "leftBracket": "",
                        "items": formula_items,
                    },
                }
            )
        else:
            # Standard index event. Event-level metrics live in `properties`; value-property
            # aggregations need frontend's two-level shape: `properties` + `quotas`.
            event_metric = {
                "quotaDesc": ev.get("analysisDesc", ""),
                "quota": ev.get("analysis", ""),
            }
            if ev.get("quota"):
                event_metric = {
                    "quotaDesc": ev.get("quotaDesc", ""),
                    "quota": ev.get("quota", ""),
                }
                event_quotas = {
                    "quotaDesc": ev.get("analysisDesc", ""),
                    "quota": ev.get("analysis", ""),
                }
            else:
                event_quotas = None
            data = {
                "identify": _uid(),
                "name": ename,
                "isLoadFilter": False,
                "filters": {"items": [], "relation": "and"},
                "event": {
                    "eventId": ev.get("eventId"),
                    "eventDesc": ev.get("eventDesc", ""),
                    "eventName": ev.get("eventName", ""),
                },
                "isShowEditName": True,
                "properties": event_metric,
            }
            if event_quotas:
                data["quotas"] = event_quotas
            correct_custom.append(
                {
                    "identify": _uid(),
                    "data": data,
                    "type": "index",
                    "formulaData": {
                        "unit": "twoBit",
                        "identify": _uid(),
                        "name": "自定义公式",
                        "filters": {"items": [], "relation": "and"},
                        "leftBracket": "",
                        "items": [],
                    },
                }
            )

    # correctDimensions: 每个 groupBy 一条
    correct_dims = []
    dim_number_range = {}
    for gb in group_by:
        dim_id = _uid()
        col_name = gb.get("columnName", "")
        col_type = gb.get("columnType", "")
        filt = {"type": gb.get("timeTypeColumnFormat", "day")} if col_type == "timestamp" else {"range": [], "type": 1}
        correct_dims.append(
            {
                "filter": filt,
                "identify": _uid(),
                "history": {"type": "LATEST"},
                "dimension": {
                    "columnType": col_type,
                    "tableType": gb.get("tableType", 0),
                    "quotaDesc": gb.get("columnDesc", ""),
                    "identify": dim_id,
                    "quota": col_name,
                    "selectType": gb.get("selectType", ""),
                    "propType": gb.get("propType", ""),
                },
            }
        )
        dim_number_range[dim_id] = filt

    # global event ref (all unique type=0 events, comma-separated)
    source_events = _report_source_events(qp_obj, metadata)
    seen_ids = [str(event["eventId"]) for event in source_events]
    seen_names = [event["eventName"] for event in source_events]
    seen_descs = [event["eventDesc"] for event in source_events]
    restore = {
        "data": {
            "dimensions": {
                "global": {
                    "eventId": ",".join(seen_ids) if seen_ids else "",
                    "eventName": ",".join(seen_names) if seen_names else "",
                    "eventDesc": ",".join(seen_descs) if seen_descs else "",
                },
            },
        },
        "modelSelected": {
            "dateDiff": 518400,
            "isApproximate": False,
            "chooseDateKey": "D|6|0",
            "dateFormatUse": 0,
            "beginDateTime": start,
            "endDateTime": end,
            "isNeedCompare": False,
        },
        "selected": {
            "correctDimensions": correct_dims,
            "isTimeParticleSize": bool(_event_time_groups(event_view)),
            "correctDimensionNumberRange": dim_number_range,
            "globalDimension": {"items": [], "relation": "and"},
            "timeParticleSize": tps,
            "correctCustom": correct_custom,
            "chart": {
                "eventsSelected": event_names_display,
                "eventsSelect": event_names_display,
                "dimensionsSelected": [],
                "typeSelect": "barStackNumber",
                "dimensionSortableData": {
                    "isSort": True,
                    "topNumber": 10,
                    "isValid": True,
                    "type": "value-desc",
                },
            },
            "table": {"sort": {}, "type": "flat"},
        },
    }
    return restore


def _sync_report_restore_event_metadata(qp_obj, metadata):
    """Keep every frontend event reference aligned with canonical event metadata."""
    report_restore = qp_obj.get("reportRestore")
    if not isinstance(report_restore, dict):
        raise ValueError("event 模型 reportRestore 必须是 JSON 对象")

    source_events = _report_source_events(qp_obj, metadata)
    if not source_events:
        raise ValueError("reportRestore 无法解析任何事件元数据")

    data = report_restore.setdefault("data", {})
    if not isinstance(data, dict):
        raise ValueError("reportRestore.data 必须是 JSON 对象")
    dimensions = data.setdefault("dimensions", {})
    if not isinstance(dimensions, dict):
        raise ValueError("reportRestore.data.dimensions 必须是 JSON 对象")
    global_event = dimensions.setdefault("global", {})
    if not isinstance(global_event, dict):
        raise ValueError("reportRestore.data.dimensions.global 必须是 JSON 对象")
    global_event.update(
        {
            "eventId": ",".join(str(event["eventId"]) for event in source_events),
            "eventName": ",".join(event["eventName"] for event in source_events),
            "eventDesc": ",".join(event["eventDesc"] for event in source_events),
        }
    )

    selected = report_restore.get("selected")
    if not isinstance(selected, dict):
        raise ValueError("reportRestore.selected 必须是 JSON 对象；请重建 reportRestore")
    correct_custom = selected.get("correctCustom")
    if not isinstance(correct_custom, list) or not correct_custom:
        raise ValueError("reportRestore.selected.correctCustom 必须是非空数组；请重建 reportRestore")

    qp_events = qp_obj.get("events") or []
    for index, restore_item in enumerate(correct_custom):
        if not isinstance(restore_item, dict):
            raise ValueError(f"reportRestore.selected.correctCustom[{index}] 必须是 JSON 对象")
        item_type = restore_item.get("type")
        item_data = restore_item.get("data")
        if not isinstance(item_data, dict):
            raise ValueError(f"reportRestore.selected.correctCustom[{index}].data 必须是 JSON 对象")

        if item_type == "index":
            event_ref = item_data.setdefault("event", {})
            if not isinstance(event_ref, dict):
                raise ValueError(f"reportRestore.selected.correctCustom[{index}].data.event 必须是 JSON 对象")
            if event_ref.get("eventId") in (None, "") and not event_ref.get("eventName"):
                fallback = qp_events[index] if index < len(qp_events) else None
                if not isinstance(fallback, dict) or _is_formula_event(fallback):
                    raise ValueError(
                        f"reportRestore.selected.correctCustom[{index}].data.event 缺少 eventId/eventName；请重建 reportRestore"
                    )
                event_ref.update(_canonical_event_ref(fallback))
            resolved = _resolve_catalog_event(
                event_ref,
                metadata,
                field_name=f"reportRestore.selected.correctCustom[{index}].data.event",
            )
            event_ref.update(_canonical_event_ref(resolved))
            continue

        if item_type == "formula":
            formula_data = restore_item.get("formulaData")
            formula_items = formula_data.get("items") if isinstance(formula_data, dict) else None
            if not isinstance(formula_items, list) or not formula_items:
                raise ValueError(
                    f"reportRestore.selected.correctCustom[{index}].formulaData.items 必须是非空数组；请重建 reportRestore"
                )
            first_resolved = None
            for formula_index, formula_item in enumerate(formula_items):
                formula_event = formula_item.get("event") if isinstance(formula_item, dict) else None
                if not isinstance(formula_event, dict):
                    raise ValueError(
                        "reportRestore.selected.correctCustom"
                        f"[{index}].formulaData.items[{formula_index}].event 必须是 JSON 对象"
                    )
                resolved = _resolve_catalog_event(
                    formula_event,
                    metadata,
                    field_name=(
                        "reportRestore.selected.correctCustom"
                        f"[{index}].formulaData.items[{formula_index}].event"
                    ),
                )
                formula_event.update(_canonical_event_ref(resolved))
                first_resolved = first_resolved or resolved

            formula_event_ref = item_data.setdefault("event", {})
            if not isinstance(formula_event_ref, dict):
                raise ValueError(f"reportRestore.selected.correctCustom[{index}].data.event 必须是 JSON 对象")
            if formula_event_ref.get("eventId") in (None, "") and not formula_event_ref.get("eventName"):
                formula_event_ref.update(_canonical_event_ref(first_resolved))
            else:
                resolved = _resolve_catalog_event(
                    formula_event_ref,
                    metadata,
                    field_name=f"reportRestore.selected.correctCustom[{index}].data.event",
                )
                formula_event_ref.update(_canonical_event_ref(resolved))
            continue

        raise ValueError(
            f"reportRestore.selected.correctCustom[{index}].type `{item_type}` 不受支持；请重建 reportRestore"
        )


def _sync_report_restore_time_grouping(qp_obj):
    """Synchronize a caller-preserved reportRestore with the normalized eventView."""
    event_view = qp_obj.get("eventView")
    report_restore = qp_obj.get("reportRestore")
    if not isinstance(event_view, dict) or not isinstance(report_restore, dict):
        return
    selected = report_restore.get("selected")
    if not isinstance(selected, dict):
        return

    time_groups = _event_time_groups(event_view)
    time_particle_size = event_view.get("timeParticleSize", TOTAL_TIME_PARTICLE_SIZE)
    selected["timeParticleSize"] = time_particle_size
    selected["isTimeParticleSize"] = bool(time_groups)

    correct_dimensions = selected.get("correctDimensions")
    if not isinstance(correct_dimensions, list):
        return

    retained_dimensions = []
    removed_dimension_ids = []
    for dimension_item in correct_dimensions:
        dimension = dimension_item.get("dimension") if isinstance(dimension_item, dict) else None
        if isinstance(dimension, dict) and dimension.get("quota") == EVENT_TIME_COLUMN:
            if not time_groups:
                dimension_id = dimension.get("identify")
                if dimension_id:
                    removed_dimension_ids.append(dimension_id)
                continue
            dimension_item["filter"] = {"type": time_particle_size}
        retained_dimensions.append(dimension_item)
    selected["correctDimensions"] = retained_dimensions

    dimension_ranges = selected.get("correctDimensionNumberRange")
    if isinstance(dimension_ranges, dict):
        for dimension_id in removed_dimension_ids:
            dimension_ranges.pop(dimension_id, None)


def cmd_report_save(args):
    """创建报表，自动生成 reportRestore 和 splitEvents 使前端能正确渲染。"""
    try:
        qp_obj = _prepare_report_qp(
            args,
            report_model=args.report_model,
            rebuild_report_restore=getattr(args, "rebuild_report_restore", False),
            validate_metadata=not getattr(args, "skip_metadata_validation", False),
        )
    except (json.JSONDecodeError, ValueError) as e:
        output({"error": True, "code": "invalid_report_qp", "message": str(e)})
        return
    fields = {
        "reportName": args.report_name,
        "reportModel": args.report_model,
        "qp": json.dumps(qp_obj, ensure_ascii=False),
    }
    if getattr(args, "report_desc", None):
        fields["reportDesc"] = args.report_desc
    evtapi_post(args, "event/reportSave", fields)


def cmd_report_edit(args):
    """编辑报表，默认重建 reportRestore 以修复旧报表的前端选项结构。"""
    try:
        qp_obj = _prepare_report_qp(
            args,
            report_model=args.report_model,
            rebuild_report_restore=not getattr(args, "preserve_report_restore", False),
            validate_metadata=not getattr(args, "skip_metadata_validation", False),
        )
    except (json.JSONDecodeError, ValueError) as e:
        output({"error": True, "code": "invalid_report_qp", "message": str(e)})
        return
    fields = {
        "reportId": str(args.report_id),
        "reportModel": args.report_model,
        "qp": json.dumps(qp_obj, ensure_ascii=False),
    }
    if getattr(args, "report_name", None):
        fields["reportName"] = args.report_name
    if getattr(args, "report_desc", None):
        fields["reportDesc"] = args.report_desc
    evtapi_post(args, "event/reportEdit", fields)


def cmd_report_list(args):
    """列出报表列表。"""
    params = {}
    if getattr(args, "report_name", None):
        params["reportName"] = args.report_name
    if getattr(args, "report_model", None):
        params["reportModel"] = args.report_model
    evtapi_get(args, "event/reportList", params)


def cmd_dashboard_add_reports(args):
    """往看板添加/更新报表列表（含网格布局）。"""
    fields = {
        "dashboardId": str(args.dashboard_id),
        "orderString": args.order_string,
    }
    if getattr(args, "coordinate", None):
        fields["coordinate"] = args.coordinate
    evtapi_post(args, "dashboard/updateDashboardReports", fields)


def _dashboard_report_from_detail(result):
    detail = _unwrap_evtapi_data(result, "获取看板报表详情")
    if isinstance(detail, dict) and not isinstance(detail.get("report"), dict):
        nested_data = detail.get("data")
        if isinstance(nested_data, dict):
            detail = nested_data
    report = detail.get("report") if isinstance(detail, dict) else None
    if not isinstance(report, dict):
        raise ValueError("获取看板报表详情失败: 响应中没有 report")
    return report


def _normalize_dashboard_report_view_info(args):
    report_view_info = _load_cluster_json(args.report_view_info, "reportViewInfo")
    if not isinstance(report_view_info, dict):
        raise ValueError("reportViewInfo must be a JSON object")

    detail_result = evtapi_get(
        args,
        "dashboard/dashboardReportDetail",
        {
            "dashboardId": str(args.dashboard_id),
            "reportId": str(args.report_id),
        },
        emit=False,
    )
    report = _dashboard_report_from_detail(detail_result)
    report_model = report.get("reportModel") or report.get("report_model")
    if report_model and report_model != "event":
        return _json_dumps_compact(report_view_info)

    event_view = _load_cluster_json(report.get("eventView") or report.get("event_view"), "eventView")
    if not isinstance(event_view, dict):
        raise ValueError("获取看板报表详情失败: eventView 不是 JSON 对象")
    _normalize_event_time_grouping(event_view)

    if _event_time_groups(event_view):
        time_particle_size = report_view_info.get("timeParticleSize")
        if time_particle_size not in EVENT_TIME_PARTICLE_SIZES:
            time_particle_size = event_view["timeParticleSize"]
    else:
        time_particle_size = TOTAL_TIME_PARTICLE_SIZE

    report_view_info["timeParticleSize"] = time_particle_size
    report_view_info["dateFormat"] = 1 if time_particle_size in {"minute", "hour"} else 0
    return _json_dumps_compact(report_view_info)


def cmd_dashboard_report_setting(args):
    """配置报表在看板中的显示设置。"""
    try:
        report_view_info = _normalize_dashboard_report_view_info(args)
    except ValueError as e:
        output({"error": True, "code": "invalid_report_view_info", "message": str(e)})
        return
    fields = {
        "dashboardId": str(args.dashboard_id),
        "reportId": str(args.report_id),
        "reportViewInfo": report_view_info,
        "reportName": args.report_name,
    }
    if getattr(args, "report_desc", None):
        fields["reportDesc"] = args.report_desc
    evtapi_post(args, "dashboard/saveDashboardReportSetting", fields)


def cmd_dashboard_detail(args):
    """获取看板详情及报表列表。"""
    evtapi_get(args, "dashboard/dashboardDetail", {"dashboardId": str(args.dashboard_id)})


def cmd_report_detail(args):
    """获取报表查询配置（events + eventView）。"""
    evtapi_get(
        args,
        "dashboard/dashboardReportDetail",
        {
            "dashboardId": str(args.dashboard_id),
            "reportId": str(args.report_id),
        },
    )


def cmd_dashboard_analysis(args):
    """执行看板报表查询。"""
    fields = {
        "dashboardId": str(args.dashboard_id),
        "reportId": str(args.report_id),
        "qp": _normalize_qp_json_arg(args.qp),
        "useCache": str(not getattr(args, "no_cache", False)).lower(),
    }
    evtapi_post(args, "dashboard/analysis", fields)


def cmd_event_analysis(args):
    """执行独立事件分析查询。"""
    fields = {
        "eventModel": args.event_model,
        "qp": _normalize_qp_json_arg(args.qp) if args.event_model == "event" else args.qp,
        "useCache": str(not getattr(args, "no_cache", False)).lower(),
    }
    evtapi_post(args, "event/analysis", fields)


# -- 2.0 看板分享子命令 --


def cmd_dashboard_share_detail(args):
    """获取看板当前的分享配置详情（哪些用户有读/写权限）。"""
    evtapi_get(
        args,
        "dashboard/dashboardShareDetail",
        {"dashboardId": str(args.dashboard_id)},
    )


def _normalize_share_ids(value, field_name, *, allow_all=False, allow_empty=False):
    if isinstance(value, (list, tuple, set)):
        values = [str(item).strip() for item in value]
    else:
        values = [item.strip() for item in str(value or "").split(",")]
    values = [item for item in values if item]
    if not values:
        if allow_empty:
            return ""
        raise ValueError(f"{field_name} 不能为空")
    if any(item.lower() == "all" for item in values):
        if allow_all and len(values) == 1:
            return "all"
        raise ValueError(f"{field_name} 不允许与 all 混用")
    invalid = [item for item in values if not item.isdigit() or int(item) <= 0]
    if invalid:
        raise ValueError(f"{field_name} 只接受正整数用户 ID，无效值: {','.join(invalid)}")
    return ",".join(dict.fromkeys(values))


def _share_ids_from_detail(result, permission):
    if _api_response_failed(result):
        raise ValueError("分享详情请求失败")
    detail = _response_data_dict(result)
    if not detail:
        raise ValueError("分享详情为空")
    keys = (
        ("readUserIds", "readOnlyUsers", "readableUsers")
        if permission == "read"
        else ("editUserIds", "editableUsers")
    )
    missing = object()
    raw = missing
    for key in keys:
        if key in detail:
            raw = detail[key]
            break
    if raw is missing:
        raise ValueError(f"分享详情缺少 {permission} 权限字段")
    if isinstance(raw, list):
        values = []
        for item in raw:
            if isinstance(item, dict):
                item = item.get("auth_user_id") or item.get("userId") or item.get("id")
            if item is not None:
                values.append(str(item))
        raw = values
    return _normalize_share_ids(raw, f"{permission}UserIds", allow_all=True, allow_empty=True)


def _share_ids_equal(left, right):
    if left == "all" or right == "all":
        return left == right
    return set(filter(None, left.split(","))) == set(filter(None, right.split(",")))


def cmd_dashboard_save_share(args):
    """保存看板分享设置，并回读验证最终权限。"""
    try:
        if getattr(args, "share_all", False):
            read_ids = "all"
        else:
            read_ids = _normalize_share_ids(args.read_user_ids, "readUserIds")
        if getattr(args, "clear_edit_users", False):
            requested_edit_ids = ""
        elif getattr(args, "edit_user_ids", None) is not None:
            requested_edit_ids = _normalize_share_ids(
                args.edit_user_ids,
                "editUserIds",
                allow_all=True,
            )
        else:
            requested_edit_ids = None
    except ValueError as e:
        output({"error": True, "code": "invalid_share_scope", "message": str(e)})
        return

    before = evtapi_get(
        args,
        "dashboard/dashboardShareDetail",
        {"dashboardId": str(args.dashboard_id)},
        emit=False,
    )
    if _api_response_failed(before):
        output(
            {
                "error": True,
                "code": "dashboard_share_precheck_failed",
                "message": "未能读取看板当前分享设置，为避免覆盖权限已停止写入。",
                "detail": before,
            }
        )
        return
    if requested_edit_ids is None:
        try:
            edit_ids = _share_ids_from_detail(before, "edit")
        except ValueError as e:
            output(
                {
                    "error": True,
                    "code": "dashboard_share_precheck_failed",
                    "message": f"无法保留现有编辑权限，已停止写入：{e}",
                }
            )
            return
    else:
        edit_ids = requested_edit_ids

    fields = {
        "dashboardId": str(args.dashboard_id),
        "readUserIds": read_ids,
        "editUserIds": edit_ids,
    }
    save_result = evtapi_post(args, "dashboard/saveDashboardShare", fields, emit=False)
    if _api_response_failed(save_result):
        output(
            {
                "error": True,
                "code": "dashboard_share_save_failed",
                "message": "看板分享设置保存失败。",
                "requested": fields,
                "detail": save_result,
            }
        )
        return

    after = evtapi_get(
        args,
        "dashboard/dashboardShareDetail",
        {"dashboardId": str(args.dashboard_id)},
        emit=False,
    )
    try:
        actual_read_ids = _share_ids_from_detail(after, "read")
        actual_edit_ids = _share_ids_from_detail(after, "edit")
    except ValueError as e:
        output(
            {
                "error": True,
                "code": "dashboard_share_verification_failed",
                "message": f"分享设置已提交，但回读验证失败：{e}",
                "requested": fields,
                "save": save_result,
                "detail": after,
            }
        )
        return

    verified = _share_ids_equal(read_ids, actual_read_ids) and _share_ids_equal(edit_ids, actual_edit_ids)
    output(
        {
            "success": verified,
            "error": not verified,
            "code": "dashboard_share_verified" if verified else "dashboard_share_verification_mismatch",
            "dashboardId": args.dashboard_id,
            "requested": {"readUserIds": read_ids, "editUserIds": edit_ids},
            "verification": {
                "readUserIds": actual_read_ids,
                "editUserIds": actual_edit_ids,
                "matches": verified,
            },
            "preservedExistingEditUsers": requested_edit_ids is None,
            "save": save_result,
        }
    )
