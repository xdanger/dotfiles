"""V1 运营指标命令: active, retention, income, source 等。"""

import json

from ..config import adplus_headers, get_adplus_config, get_config
from ..http import http_request, output
from ..query import build_ad_group, build_base_body, do_query
from ..schema import AD_COL_ALIAS_MAP
from ..truncate import _slim_rows, parse_ad_response, truncate_response


def cmd_active(args):
    quotas = args.quota  # list, e.g. ["dau"] or ["dau", "wau", "mau"]
    if len(quotas) == 1:
        do_query(args, "active", {"subject": args.subject, "quota": quotas[0]})
        return
    # 多 quota: 逐个查询，按时间 key 做横向合并
    all_results = []  # each element: (rows_as_dicts, trunc_info_or_None)
    errors: list[str] = []
    for q in quotas:
        key, base_url = get_config(args.region)
        body = build_base_body(args)
        body.update({"subject": args.subject, "quota": q})
        url = f"{base_url}/mcp/op/active"
        result = http_request("POST", url, {"MCP-KEY": key}, body)
        if isinstance(result, dict) and result.get("error"):
            errors.append(f"{q}: {result.get('message', '未知错误')}")
            continue  # 收集错误继续，避免全盘失败
        trunc_info = None
        if not getattr(args, "no_truncate", False):
            group_alias = None
            if isinstance(body.get("group"), dict):
                group_alias = body["group"].get("col_alias")
            result = truncate_response(result, "active", group_alias=group_alias)  # pyright: ignore[reportAssignmentType]
        # 提取行数据和截断信息
        if isinstance(result, dict):
            trunc_info = result.get("_truncation")
            rows = result.get("data", [])
        elif isinstance(result, list):
            rows = result
        else:
            rows = []
        # 统一转为 dict 格式
        if rows and isinstance(rows[0], list):
            headers = [str(h) for h in rows[0]]
            rows = [dict(zip(headers, r, strict=False)) for r in rows[1:]]
        # 过滤掉占位符行（截断省略标记）
        rows = [r for r in rows if isinstance(r, dict)]  # pyright: ignore[reportGeneralTypeIssues]
        if rows:
            all_results.append((rows, trunc_info))
    if not all_results:
        if errors:
            output({"error": True, "message": f"所有 quota 查询均失败: {'; '.join(errors)}"})
        else:
            output([])
        return
    # 找到时间 key（date/time/activation_time 等）
    _time_keys = ("date", "time", "activation_time", "start_time", "date_", "time_", "activation_time_", "start_time_")
    first_row = all_results[0][0][0]
    time_key = None
    for tk in _time_keys:
        if tk in first_row:
            time_key = tk
            break
    if not time_key:
        time_key = next(iter(first_row))

    # 合并: 以第一个 quota 结果为基准，按 time_key 做横向 merge
    # 日期格式统一: API 可能返回 "2026-04-14T00:00:00" 或 "2026-04-14 00:00:00"
    def _norm_date(v):
        if isinstance(v, str):
            return v.replace("T", " ")
        return v

    row_map = {}  # normalized_time_key_value -> merged dict
    for rows, _ in all_results:
        for row in rows:
            raw_k = row.get(time_key)
            k = _norm_date(raw_k)
            if k in row_map:
                row_map[k].update(row)
                # 统一日期值为一致格式
                row_map[k][time_key] = k
            else:
                merged_row = dict(row)
                merged_row[time_key] = k
                row_map[k] = merged_row
    merged = list(row_map.values())
    # 收集截断信息
    trunc = None
    for _, ti in all_results:
        if ti:
            trunc = ti
            break
    result: dict[str, object] = {"data": merged}  # pyright: ignore[reportUnknownVariableType]
    if errors:
        result["_partial_errors"] = "; ".join(errors)
    if trunc:
        result["_truncation"] = trunc
    output(result)


def _trim_sequence(values, head=15, tail=15):
    """Return the full sequence; row-count truncation is disabled."""
    return values, None


def _truncate_op_overview_result(result):
    """Return op_overview results without row-count truncation."""
    return result


def cmd_op_overview(args):
    """查询运营概览数据 — 直接走 ad-plus /op/op_overview。"""
    if args.interval in ("minute", "hour") and not args.compared_date:
        output(
            {
                "error": True,
                "message": "op_overview 在 --interval minute/hour 时需要 --compared-date",
                "hint": "例如: --compared-date 2026-05-07",
            }
        )
        return

    key, base_url = get_adplus_config(args.region)
    end_date = args.end
    # Day 粒度时追加 23:59:59 确保覆盖完整当日（对所有 quota 一致）
    if args.interval == "day" and len(end_date) <= 10:
        end_date = f"{end_date} 23:59:59"

    body = {
        "project_id": int(args.project_id),
        "start_date": args.start,
        "end_date": end_date,
        "interval": args.interval,
        "quota": args.quota,
        "use_cache": not getattr(args, "no_cache", False),
    }
    if args.compared_date:
        body["compared_date"] = args.compared_date
    if args.tz_offset is not None:
        body["tz_offset"] = args.tz_offset

    url = f"{base_url}/op/op_overview"
    result = http_request("POST", url, adplus_headers(key), body)
    if not getattr(args, "no_truncate", False):
        result = _truncate_op_overview_result(result)
    output(result)


def cmd_retention(args):
    if not args.group_by or args.group_by == "time":
        args.group_by = "activation_time"
    extra = {
        "subject": args.subject,
        "interval_unit": args.interval_unit,
        "percent": args.percent,
    }
    if args.all_retention:
        extra["extend_day"] = True
    is_user = args.subject == "user"
    subject_cn = "用户（账号）" if is_user else "设备"
    base_cn = "新增用户数" if is_user else "新增设备数"
    do_query(
        args,
        "retention",
        extra,
        query_context={
            "subject": args.subject,
            "subject_cn": subject_cn,
            "field_semantics": {
                "newDevice": f"{base_cn}（服务端历史字段名保持不变）",
                "*_newDevice": f"对应留存率分母的{base_cn}（服务端历史后缀保持不变）",
            },
        },
    )


def cmd_income(args):
    if getattr(args, "group_by", None) == "activation_time":
        output(
            {
                "error": True,
                "message": "income 接口不支持 -g activation_time（会导致服务端 500 错误）",
                "hint": "请改用 -g time",
            }
        )
        return
    do_query(args, "income_data", cmd_type="income")


def cmd_source(args):
    if not args.group_by or args.group_by == "time":
        args.group_by = "activation_time"
    do_query(args, "source")


def cmd_player_behavior(args):
    do_query(
        args,
        "player_behavior",
        {
            "quota": args.quota,
            "duration_unit": args.duration_unit,
        },
    )


def cmd_version_distri(args):
    do_query(args, "version_distri")


def cmd_user_value(args):
    if not args.group_by or args.group_by == "time":
        args.group_by = "activation_time"
    do_query(args, "user_value")


def cmd_whale_user(args):
    do_query(args, "whale_user")


def cmd_life_cycle(args):
    if getattr(args, "group_by", None) == "activation_os" and getattr(args, "quota", None) != "payment_cvs_rate":
        output(
            {
                "error": True,
                "message": "life_cycle 接口在 -g activation_os 时仅支持 --quota payment_cvs_rate（其他 quota 会 500）",
                "hint": "请改用 --quota payment_cvs_rate 或改用 -g time / -g activation_time",
            }
        )
        return
    do_query(args, "life_cycle", {"quota": args.quota})


def cmd_cost(args):
    if not args.group_by or args.group_by == "time":
        args.group_by = "dt"
    do_query(args, "omp-cost", cmd_type="cost")


def cmd_ad_data(args):
    """查询广告投放(买量)数据 — 走 /mcp/ad/multiple_display_web。"""
    key, base_url = get_config(args.region)
    group_by = args.group_by or "time"
    quotas = [q.strip() for q in args.quotas.split(",") if q.strip()]
    body = {
        "project_id": int(args.project_id),
        "start_time": f"{args.start} 00:00:00",
        "end_time": f"{args.end} 23:59:59",
        "group": build_ad_group(group_by),
        "quotas": quotas,
        "ad_increment": args.ad_increment.lower() != "false",
        "tz_offset": args.tz_offset,
        "charge_subject": args.charge_subject,
        "filters": json.loads(args.filters) if args.filters else [],
        "use_cache": True,
        "page": 1,
        "page_size": args.limit or 5000,
    }
    if args.sort_field:
        body["sort"] = {"field": args.sort_field, "order": args.sort_order}
    exchange_to = getattr(args, "exchange_to_currency", None)
    if exchange_to and exchange_to.lower() != "none":
        body["exchange_to_currency"] = exchange_to.upper()

    url = f"{base_url}/mcp/ad/multiple_display_web"
    resp = http_request("POST", url, {"MCP-KEY": key}, body)

    if isinstance(resp, dict) and resp.get("error"):
        output(resp)
        return

    rows, summary = parse_ad_response(resp)
    if rows is None:
        output(resp)
        return

    group_alias = AD_COL_ALIAS_MAP.get(group_by, group_by)
    if not getattr(args, "no_truncate", False):
        rows, trunc_info = _slim_rows(rows, "ad_data", group_alias=group_alias)
    else:
        trunc_info = None

    result: dict[str, object] = {"data": rows}  # pyright: ignore[reportUnknownVariableType]
    if summary is not None:
        result["summary"] = summary
    if trunc_info:
        result["_truncation"] = trunc_info
    output(result)


_AD_MONET_DIM_MAP = {
    "ad_network": "#ad_network",
    "ad_union_type": "#ad_union_type",
    "ad_type": "#ad_type",
}

_AD_MONET_ALIAS_MAP = {
    "#ad_network": "ad_network",
    "#ad_union_type": "ad_union_type",
    "#ad_type": "ad_type",
}


def _normalize_ad_monet_body(body):
    group = body.get("group")
    if isinstance(group, dict):
        col_name = group.get("col_name")
        normalized = _AD_MONET_DIM_MAP.get(col_name, col_name) if isinstance(col_name, str) else col_name
        group["col_name"] = normalized
        if isinstance(normalized, str) and normalized in _AD_MONET_ALIAS_MAP:
            group["col_alias"] = _AD_MONET_ALIAS_MAP[normalized]

    filters = body.get("filters")
    if isinstance(filters, list):
        for item in filters:
            if not isinstance(item, dict):
                continue
            col_name = item.get("col_name")
            if isinstance(col_name, str) and col_name in _AD_MONET_DIM_MAP:
                item["col_name"] = _AD_MONET_DIM_MAP[col_name]


def cmd_ad_monet(args):
    key, base_url = get_adplus_config(args.region)
    body = build_base_body(args)
    _normalize_ad_monet_body(body)

    url = f"{base_url}/ad_monet/revenue"
    result = http_request("POST", url, adplus_headers(key), body)
    if not getattr(args, "no_truncate", False):
        group_alias = None
        if isinstance(body.get("group"), dict):
            group_alias = body["group"].get("col_alias")
        result = truncate_response(result, "ad_monet", group_alias=group_alias)
    output(result)


def cmd_raw(args):
    key, base_url = get_config(args.region)
    body = json.loads(args.body) if args.body else None
    method = "POST" if body else "GET"
    url = f"{base_url}/mcp{args.path}"
    result = http_request(method, url, {"MCP-KEY": key}, body)
    output(result)
