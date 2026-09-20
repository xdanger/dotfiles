"""数据截断逻辑 — 节省上下文窗口 token。"""

_TIME_FIELDS = frozenset(
    ("date", "time", "activation_time", "start_time", "date_", "time_", "activation_time_", "start_time_")
)

# 需要做 null 列剪裁的命令类型（列数多且含大量 trailing null）
_NULL_STRIP_CMD_TYPES = frozenset(("retention", "user_value"))


def _slim_rows(rows, cmd_type=None, group_alias=None):
    """Return all rows without row-count truncation.

    Kept as a compatibility shim for callers that still import _slim_rows.
    """
    return rows, None


def _strip_null_cols(rows):
    """Remove keys whose value is None from each dict row.

    Dramatically reduces token usage for retention (106 cols → ~15)
    and user_value/LTV (71 cols → ~10) where most columns are trailing nulls.
    """
    if not rows or not isinstance(rows[0], dict):
        return rows
    return [{k: v for k, v in row.items() if v is not None} for row in rows]


def _strip_null_cols_dict(rows):
    """Strip keys that are None in ALL dict rows (column-level pruning for dicts).

    Unlike _strip_null_cols which strips per-row, this only strips keys that
    are consistently null across every row. Safe for any command — doesn't
    remove keys that have values in some rows but not others.

    Saves tokens for whale_user (user_name/server/LEVEL always null = -37%).
    """
    dict_rows = [r for r in rows if isinstance(r, dict)]
    if len(dict_rows) < 2:
        return rows, 0
    all_keys = set()
    for r in dict_rows:
        all_keys.update(r.keys())
    null_keys = {k for k in all_keys if all(r.get(k) is None for r in dict_rows)}
    if not null_keys:
        return rows, 0
    return [{k: v for k, v in r.items() if k not in null_keys} if isinstance(r, dict) else r for r in rows], len(
        null_keys
    )


def _strip_null_cols_lol(lol):
    """Strip columns from list-of-lists where ALL data rows have null.

    Much more token-efficient than converting to dicts, since list-of-lists
    avoids repeating column names per row.

    For retention (106 cols) querying 14 days, this removes ~60+ trailing
    null columns (DR15-DR180, _newDevice=0, _rate) in one pass.
    """
    if not lol or len(lol) < 2:
        return lol, False
    headers = lol[0]
    data_rows = lol[1:]
    n_cols = len(headers)

    # Find columns where every data row has null or 0
    # (for retention _newDevice columns, 0 means "no data for that day")
    keep = []
    for ci in range(n_cols):
        for row in data_rows:
            val = row[ci] if ci < len(row) else None
            if val is not None and val != 0:
                keep.append(ci)
                break
        # If no break: all rows have null/0 for this column — skip it

    if len(keep) == n_cols:
        return lol, False  # nothing stripped

    new_headers = [headers[i] for i in keep]
    new_rows = [[row[i] if i < len(row) else None for i in keep] for row in data_rows]
    return [new_headers] + new_rows, True


def _list_of_lists_to_dicts(lol):
    """Convert [[header...], [row...], ...] to [{header: val, ...}, ...]."""
    headers = [str(h) for h in lol[0]]
    return [dict(zip(headers, row, strict=False)) for row in lol[1:]]


def _locate_data(obj):
    """Find main data list in API response. Returns (list, path_str) or (None, None)."""
    if isinstance(obj, list):
        if obj and isinstance(obj[0], list):
            return _list_of_lists_to_dicts(obj), "root"
        return obj, "root"
    if not isinstance(obj, dict):
        return None, None
    data = obj.get("data")
    if isinstance(data, list) and data:
        if isinstance(data[0], list):
            return _list_of_lists_to_dicts(data), "data"
        if isinstance(data[0], dict):
            return data, "data"
    if isinstance(data, dict):
        for key in ("items", "list", "rows", "records"):
            sub = data.get(key)
            if isinstance(sub, list) and sub:
                if isinstance(sub[0], list):
                    return _list_of_lists_to_dicts(sub), f"data.{key}"
                if isinstance(sub[0], dict):
                    return sub, f"data.{key}"
    return None, None


def _is_lol(obj):
    """Check if obj is a list-of-lists (raw API format)."""
    return isinstance(obj, list) and obj and isinstance(obj[0], list)


def _rebuild(resp, path, rows, info):
    """Reconstruct response with truncated rows and info."""
    if path == "root":
        return {"data": rows, "_truncation": info}
    result = dict(resp)
    result["_truncation"] = info
    if path == "data":
        result["data"] = rows
    elif path.startswith("data."):
        subkey = path[5:]
        result["data"] = dict(resp["data"])
        result["data"][subkey] = rows
    return result


SUMMARY_NOTE = (
    "summary 为 TapDB 返回的全期汇总行（金额类为求和、人数/比率类为均值），已从 data 明细中剔除，请勿与明细行相加"
)


def _summary_split_lol(lol, time_fields):
    """Split null-time summary rows out of a list-of-lists table."""
    headers = lol[0]
    time_idx = next((i for i, h in enumerate(headers) if str(h) in time_fields), None)
    if time_idx is None:
        return lol, None
    detail, summary_rows = [], []
    for row in lol[1:]:
        val = row[time_idx] if time_idx < len(row) else None
        (summary_rows if val is None else detail).append(row)
    if not summary_rows:
        return lol, None
    summaries = [dict(zip([str(h) for h in headers], r, strict=False)) for r in summary_rows]
    return [headers] + detail, summaries[0] if len(summaries) == 1 else summaries


def _summary_split_dicts(rows, time_fields):
    """Split null-time summary rows out of a list of dict rows."""
    keys = set()
    for r in rows:
        keys.update(r.keys())
    fields = keys & time_fields
    if not fields:
        return rows, None
    detail, summary_rows = [], []
    for row in rows:
        (summary_rows if all(row.get(f) is None for f in fields) else detail).append(row)
    if not summary_rows:
        return rows, None
    return detail, summary_rows[0] if len(summary_rows) == 1 else summary_rows


def split_time_summary(resp, group_alias=None):
    """Extract the null-time summary row TapDB appends to time-grouped results.

    /mcp/op/* 接口按时间分组时会在明细行之外多返回一行时间字段为 null 的
    全期汇总行（金额类为求和、人数/比率类为均值）。该行没有任何标注，极易被
    下游当成普通明细一起相加导致翻倍。这里把它拆出来单独返回。

    Returns (resp_without_summary, summary_dict_or_list_or_None).
    """
    time_fields: set[str] = set(_TIME_FIELDS)
    if group_alias:
        time_fields.add(str(group_alias))

    if _is_lol(resp):
        return _summary_split_lol(resp, time_fields)

    if isinstance(resp, dict) and not resp.get("error"):
        data = resp.get("data")
        if _is_lol(data):
            new_data, summary = _summary_split_lol(data, time_fields)
        elif isinstance(data, list) and data and isinstance(data[0], dict):
            new_data, summary = _summary_split_dicts(data, time_fields)
        else:
            return resp, None
        if summary is None:
            return resp, None
        result = dict(resp)
        result["data"] = new_data
        return result, summary

    return resp, None


def parse_ad_response(resp):
    """Parse ad API response into (rows_as_dicts, summary_row_or_None).

    The ad API returns a flat list:
      [ total_count, [header1, header2, ...], [row1_val, ...], ..., [total_val, ...] ]
    or wrapped in {"data": [...]}.
    The first element is a total_count integer, followed by headers, data rows,
    and a summary/total row at the end.
    """
    data = resp
    if isinstance(resp, dict):
        if resp.get("error"):
            return None, None
        data = resp.get("data", resp)
    if not isinstance(data, list) or len(data) < 2:
        return None, None
    # Skip leading scalar (total_count) if present
    start = 0
    if not isinstance(data[0], list):
        start = 1
    if start >= len(data):
        return None, None
    headers = [str(h) for h in data[start]]
    rows = [dict(zip(headers, r, strict=False)) for r in data[start + 1 :]]
    if not rows:
        return [], None
    # Last row is the summary/total row
    summary = rows[-1]
    rows = rows[:-1]
    return rows, summary


def truncate_response(resp, cmd_type=None, group_alias=None):
    """Truncate API response to save context window tokens.

    Preserves original format (list-of-lists stays as list-of-lists) to
    minimize token overhead. Dict format repeats key names per row and
    can be 2x larger than list-of-lists for the same data.
    """
    if not resp or (isinstance(resp, dict) and resp.get("error")):
        return resp

    # Null column stripping for retention / user_value (list-of-lists format)
    if cmd_type in _NULL_STRIP_CMD_TYPES:
        raw_lol = resp if _is_lol(resp) else None
        if raw_lol is not None:
            stripped, changed = _strip_null_cols_lol(raw_lol)
            if changed:
                resp = stripped
            # Row-count truncation is disabled; keep the compact list-of-lists format.
            return resp

    rows, path = _locate_data(resp)
    if not rows:
        return resp

    info = {}
    rows, row_info = _slim_rows(rows, cmd_type, group_alias=group_alias)
    if row_info:
        info.update(row_info)

    # Strip keys that are null across ALL rows (e.g. whale_user's user_name/server/LEVEL)
    rows, n_stripped = _strip_null_cols_dict(rows)
    if n_stripped:
        info["stripped_null_keys"] = n_stripped

    if not info:
        return resp
    return _rebuild(resp, path, rows, info)
