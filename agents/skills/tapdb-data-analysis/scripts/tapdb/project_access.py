"""Project access guard for TapDB project-bound commands."""

import contextlib
import json
import os
import sys
import tempfile
import time
import urllib.parse
from collections.abc import Iterator
from typing import Any

from .config import adplus_headers, get_adplus_config
from .http import http_request, output

_PROJECT_ID_KEYS = ("project_id", "projectId", "pid", "tapdb_project_id")
_RAW_PROJECT_ID_KEYS = ("project_id", "projectId", "pid")
_NESTED_PROJECT_LIST_KEYS = ("data", "list", "items", "rows", "records", "projects", "children", "result")
_NEGATIVE_CACHE_TTL_SECONDS = 6 * 60 * 60


def _safe_cache_part(value: str) -> str:
    text = str(value or "").strip()
    return "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in text)[:96] or "unknown"


def _cache_identity() -> str:
    """Public installs do not use a per-session cache identity."""
    return ""


def _negative_cache_path(region: str, project_id: str) -> str:
    cache_root = os.path.join(tempfile.gettempdir(), "tapdb_project_access_negative")
    filename = "__".join(
        [
            _safe_cache_part(_cache_identity()),
            _safe_cache_part(region),
            _safe_cache_part(project_id),
        ]
    )
    return os.path.join(cache_root, f"{filename}.json")


def _read_negative_cache(region: str, project_id: str) -> dict[str, Any] | None:
    path = _negative_cache_path(region, project_id)
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    try:
        created_at = float(payload.get("created_at", 0))
    except (TypeError, ValueError):
        return None
    if time.time() - created_at > _NEGATIVE_CACHE_TTL_SECONDS:
        _suppress_oserror_remove(path)
        return None
    return payload


def _suppress_oserror_remove(path: str) -> None:
    with contextlib.suppress(OSError):
        os.remove(path)


def _write_negative_cache(region: str, project_id: str, payload: dict[str, Any]) -> None:
    path = _negative_cache_path(region, project_id)
    data = dict(payload)
    data["created_at"] = time.time()
    data["ttl_seconds"] = _NEGATIVE_CACHE_TTL_SECONDS
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass


def verify_project_access_or_exit(args: Any) -> None:
    """Fail closed before any project-bound query if project_id is not accessible."""
    project_id = _extract_project_id(args)
    if not project_id:
        return

    region = str(getattr(args, "region", "") or "cn")
    watch_project_id = getattr(args, "watch_project_id", None)
    watch_project_name = getattr(args, "watch_project_name", None)
    # A watch project changes the authoritative list, so a prior default-list miss
    # must not short-circuit this explicit, backend-authorized lookup.
    cached = _read_negative_cache(region, project_id) if _cache_identity() and watch_project_id is None and not watch_project_name else None
    if cached:
        payload = _project_not_accessible_payload(
            project_id,
            region,
            int(cached.get("accessible_project_count", 0) or 0),
        )
        payload["cached"] = True
        payload["message"] = (
            f"project_id {project_id} 已在本 session 判定为不在 `list_projects -r {region}` "
            "返回的可访问项目列表中，已直接停止后续查询。"
        )
        output(payload)
        sys.exit(3)

    result = _fetch_accessible_projects(region, watch_project_id, watch_project_name)
    rows = list(_iter_project_dicts(result))

    if isinstance(result, dict) and result.get("error"):
        output(
            {
                "error": True,
                "code": "project_access_check_failed",
                "message": "无法确认 TapDB 项目访问权限，已停止执行后续查询。",
                "project_id": project_id,
                "region": region,
                "detail": result,
                "hint": (
                    "请先确认 list_projects 可正常返回项目列表；不要在权限未确认时继续执行指标、v2 或 sync 查询。"
                ),
            }
        )
        sys.exit(3)

    matched = _find_project_row(rows, project_id)
    if matched is None:
        payload = _project_not_accessible_payload(project_id, region, len(rows))
        if _cache_identity():
            _write_negative_cache(region, project_id, payload)
        output(payload)
        sys.exit(3)


def _project_not_accessible_payload(project_id: str, region: str, accessible_project_count: int) -> dict[str, Any]:
    return {
        "error": True,
        "code": "project_not_accessible",
        "message": (
            f"project_id {project_id} 不在 `list_projects -r {region}` 返回的可访问项目列表中，"
            "已停止执行后续查询。"
        ),
        "project_id": project_id,
        "region": region,
        "accessible_project_count": accessible_project_count,
        "hint": (
            "请先用 `list_projects` 按项目名/备注/标签重新确认可访问项目；"
            "不要继续用这个 project_id 发指标、v2、sync 查询，也不要只靠切换 region 重试同一个 ID。"
        ),
    }


def _fetch_accessible_projects(region: str, watch_project_id: Any = None, watch_project_name: Any = None) -> Any:
    key, base_url = get_adplus_config(region)
    params = {"type": "all"}
    if watch_project_id is not None:
        params["watchProjectId"] = str(watch_project_id)
    elif watch_project_name:
        params["watchProjectName"] = str(watch_project_name)
    url = f"{base_url}/project/accessible-projects?{urllib.parse.urlencode(params)}"
    result = http_request("GET", url, adplus_headers(key), max_retries=3)
    if isinstance(result, dict) and result.get("error"):
        return result
    if isinstance(result, dict) and "data" in result:
        return result["data"]
    return result


def _extract_project_id(args: Any) -> str:
    project_id = getattr(args, "project_id", None)
    if project_id is not None:
        return str(project_id).strip()

    if getattr(args, "command", "") == "raw":
        return _extract_raw_project_id(getattr(args, "path", ""), getattr(args, "body", None))

    return ""


def _extract_raw_project_id(path: str, body: str | None) -> str:
    parsed = urllib.parse.urlparse(path or "")
    query = urllib.parse.parse_qs(parsed.query)
    for key in _RAW_PROJECT_ID_KEYS:
        values = query.get(key)
        if values:
            return str(values[0]).strip()

    if not body:
        return ""
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return ""
    if not isinstance(payload, dict):
        return ""
    for key in _RAW_PROJECT_ID_KEYS:
        value = payload.get(key)
        if value is not None:
            return str(value).strip()
    return ""


def _iter_project_dicts(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from _iter_project_dicts(item)
        return

    if not isinstance(value, dict):
        return

    if _row_project_id(value):
        yield value

    for key in _NESTED_PROJECT_LIST_KEYS:
        if key in value:
            yield from _iter_project_dicts(value[key])


def _find_project_row(rows: list[dict[str, Any]], project_id: str) -> dict[str, Any] | None:
    target = str(project_id).strip()
    for row in rows:
        if _row_project_id(row) == target:
            return row
    return None


def _row_project_id(row: dict[str, Any]) -> str:
    for key in _PROJECT_ID_KEYS:
        value = row.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    if not any(key in row for key in _NESTED_PROJECT_LIST_KEYS):
        value = row.get("id")
        if value is not None:
            return str(value).strip()
    return ""
