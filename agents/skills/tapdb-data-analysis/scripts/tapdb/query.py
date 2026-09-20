"""通用请求体构造与查询执行。"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .config import get_config, get_evtapi_config
from .http import connection_error, http_request, is_certificate_error, open_url, output
from .schema import AD_COL_ALIAS_MAP, COL_ALIAS_MAP, COUNTRY_GROUP_DIMS
from .truncate import SUMMARY_NOTE, split_time_summary, truncate_response

# 服务端不支持 week/month 粒度的接口（按 activation_time 分组时始终返回逐日数据）
_DAY_ONLY_ENDPOINTS = {"source", "retention", "user_value", "life_cycle"}


def build_group(group_by, group_unit):
    if not group_by:
        return None
    is_time = group_by in ("time", "activation_time")
    return {
        "col_name": group_by,
        "col_alias": COL_ALIAS_MAP.get(group_by, group_by),
        "is_time": is_time,
        "trunc_unit": group_unit or "day",
    }


def build_ad_group(group_by):
    """Build group dict for the ad API (fixed day granularity)."""
    if not group_by:
        return None
    is_time = group_by == "time"
    return {
        "col_name": group_by,
        "col_alias": AD_COL_ALIAS_MAP.get(group_by, group_by),
        "is_time": is_time,
        "trunc_unit": "day",
    }


def build_base_body(args):
    body: dict[str, Any] = {"project_id": int(args.project_id)}
    if hasattr(args, "start") and args.start:
        body["start_time"] = f"{args.start} 00:00:00.000"
    if hasattr(args, "end") and args.end:
        body["end_time"] = f"{args.end} 23:59:59.999"
    group_by = getattr(args, "group_by", None) or "time"
    group_unit = getattr(args, "group_unit", None)
    body["group"] = build_group(group_by, group_unit)
    if group_by in COUNTRY_GROUP_DIMS:
        body["language"] = getattr(args, "language", None) or "cn"
        group_dim = getattr(args, "group_dim", None)
        if group_dim:
            body["group_dim"] = group_dim
        elif group_by == "activation_country":
            body["group_dim"] = "cy"
    body["is_de_water"] = getattr(args, "de_water", False)
    if getattr(args, "filters", None):
        raw_filters = json.loads(args.filters)
        # 过滤掉 ftv 为空的 filter，避免后端生成无效 SQL
        body["filters"] = [
            f for f in raw_filters if f.get("calculate_symbol") in ("is_null", "is_not_null") or f.get("ftv")
        ]
    else:
        body["filters"] = []
    if getattr(args, "charge_subject", None):
        body["charge_subject"] = args.charge_subject
    exchange_to = getattr(args, "exchange_to_currency", None)
    if exchange_to and exchange_to.lower() != "none":
        body["real_time_currency"] = True
        body["exchange_to_currency"] = exchange_to.upper()
    body["use_cache"] = not getattr(args, "no_cache", False)
    if getattr(args, "limit", None):
        body["limit_num"] = args.limit
    return body


def do_query(args, endpoint_path, extra=None, cmd_type=None, query_context=None):
    key, base_url = get_config(args.region)
    body = build_base_body(args)

    # 拦截: activation_time 类接口不支持 week/month 粒度，硬报错阻断
    # （服务端不会报错，但会静默返回逐日数据，容易被误以为是周/月汇总）
    group = body.get("group")
    if (
        group
        and isinstance(group, dict)
        and endpoint_path in _DAY_ONLY_ENDPOINTS
        and group.get("trunc_unit") in ("week", "month")
    ):
        bad_unit = group["trunc_unit"]
        output(
            {
                "error": True,
                "message": (
                    f"{endpoint_path} 接口不支持 --group-unit {bad_unit}"
                    f"（服务端会静默返回逐日数据，无法真正按 {bad_unit} 汇总）"
                ),
                "hint": (
                    f"请改用 --group-unit day 并自行在客户端按 {bad_unit} 汇总，"
                    f"或缩小 --start/--end 时间范围 + 使用 --limit 控制数据量。"
                    f"不支持 week/month 的接口：{sorted(_DAY_ONLY_ENDPOINTS)}"
                ),
            }
        )
        sys.exit(2)

    if extra:
        body.update(extra)
    url = f"{base_url}/mcp/op/{endpoint_path}"
    result = http_request("POST", url, {"MCP-KEY": key}, body)

    group_alias = None
    if isinstance(body.get("group"), dict):
        group_alias = body["group"].get("col_alias")

    # 时间分组时服务端会在明细外追加一行时间为 null 的全期汇总行，
    # 拆出来放到 summary 字段，避免下游把它与明细一起相加（收入翻倍事故）
    summary = None
    if group and isinstance(group, dict) and group.get("is_time"):
        result, summary = split_time_summary(result, group_alias=group_alias)

    if not getattr(args, "no_truncate", False):
        result = truncate_response(result, cmd_type or endpoint_path, group_alias=group_alias)

    if summary is not None:
        result = dict(result) if isinstance(result, dict) else {"data": result}
        result["summary"] = summary
        result["_summary_note"] = SUMMARY_NOTE
    if query_context and not (isinstance(result, dict) and result.get("error")):
        result = dict(result) if isinstance(result, dict) else {"data": result}
        result["_query_context"] = query_context
    output(result)


def _evtapi_base_params(args):
    return [
        ("lang", "zh_CN"),
        ("projectId", str(args.project_id)),
    ]


def evtapi_get(args, path, params=None, emit=True):
    """发起 evtapi GET 请求。"""
    key, base_url = get_evtapi_config(args.region)
    qs_parts = _evtapi_base_params(args)
    if params:
        for k, v in params.items():
            qs_parts.append((k, v))
    qs = urllib.parse.urlencode(qs_parts, doseq=True)
    url = f"{base_url}/{path}?{qs}"
    result = http_request("GET", url, {"MCP-KEY": key})
    if emit:
        output(result)
    return result


def evtapi_post(
    args: Any,
    path: str,
    form_fields: dict[str, Any] | None = None,
    *,
    emit: bool = True,
) -> Any:
    """发起 evtapi POST 请求 (application/x-www-form-urlencoded)。"""
    key, base_url = get_evtapi_config(args.region)
    url = f"{base_url}/{path}"

    fields = {
        "lang": "zh_CN",
        "projectId": str(args.project_id),
    }
    if form_fields:
        fields.update(form_fields)

    data = urllib.parse.urlencode(fields).encode("utf-8")
    headers = {
        "MCP-KEY": key,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with open_url(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        result = {"error": True, "status": e.code, "message": err_body}
    except urllib.error.URLError as e:
        result = connection_error(e.reason)
    except Exception as e:
        result = connection_error(e) if is_certificate_error(e) else {"error": True, "message": str(e)}

    if not getattr(args, "no_truncate", False):
        result = truncate_response(result)
    if emit:
        output(result)
    return result
