"""埋点上报概览、实时监测与错误排查命令。"""

import time
from datetime import date, datetime
from datetime import time as datetime_time
from typing import Any

from ..http import output
from ..query import evtapi_get, evtapi_post

REAL_TIME_DETAIL_READY_WAIT_SECONDS = 10


def _parse_local_time(value: str, *, end_of_day: bool) -> datetime:
    text = value.strip()
    try:
        if len(text) == 10:
            parsed_date = date.fromisoformat(text)
            boundary = datetime_time(23, 59, 59) if end_of_day else datetime_time()
            return datetime.combine(parsed_date, boundary)
        parsed = datetime.fromisoformat(text.replace("T", " "))
    except ValueError as exc:
        raise ValueError(f"时间格式无效: {value}") from exc
    if parsed.tzinfo is not None:
        raise ValueError(f"时间不应包含时区偏移: {value}")
    return parsed.replace(microsecond=0)


def _time_range_params(args: Any) -> dict[str, str] | None:
    try:
        start = _parse_local_time(str(args.start), end_of_day=False)
        end = _parse_local_time(str(args.end), end_of_day=True)
    except ValueError as exc:
        output(
            {
                "error": True,
                "code": "invalid_time_range",
                "message": str(exc),
                "hint": "请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS。",
            }
        )
        return None

    if start > end:
        output(
            {
                "error": True,
                "code": "invalid_time_range",
                "message": "开始时间不能晚于结束时间。",
                "start": start.strftime("%Y-%m-%d %H:%M:%S"),
                "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        return None

    return {
        "startTime": start.strftime("%Y-%m-%d %H:%M:%S"),
        "endTime": end.strftime("%Y-%m-%d %H:%M:%S"),
    }


def cmd_bury_point_overview(args: Any) -> None:
    """查询埋点接收、入库、异常和失败概览。"""
    params = _time_range_params(args)
    if params is not None:
        evtapi_get(args, "buryPoint/list", params)


def cmd_bury_point_error_detail(args: Any) -> None:
    """查询指定事件的埋点错误字段与错误码明细。"""
    params = _time_range_params(args)
    if params is None:
        return
    params["eventName"] = str(args.event_name)
    evtapi_get(args, "buryPoint/errorDetail", params)


def cmd_bury_point_real_time_status(args: Any) -> None:
    """查询埋点实时监测开关状态。"""
    evtapi_get(args, "buryPoint/realTimeStatus")


def cmd_bury_point_real_time_detail(args: Any) -> None:
    """查询实时埋点上报明细。"""
    evtapi_get(args, "buryPoint/realTimeDetail")


def _evtapi_succeeded(result: Any) -> bool:
    if not isinstance(result, dict) or result.get("error"):
        return False
    return result.get("return_code") in (None, 0, "0")


def cmd_bury_point_real_time_switch(args: Any) -> None:
    """开启或关闭实时埋点上报明细监测。"""
    status = str(args.status)
    result = evtapi_post(
        args,
        "buryPoint/editRealTimeStatus",
        {"status": status},
        emit=False,
    )
    if status == "on" and _evtapi_succeeded(result):
        wait_seconds = max(
            0,
            int(getattr(args, "wait_seconds", REAL_TIME_DETAIL_READY_WAIT_SECONDS)),
        )
        if wait_seconds:
            time.sleep(wait_seconds)
    output(result)
