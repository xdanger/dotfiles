#!/usr/bin/env python3
"""Read the newest Codex rate-limit snapshot from one or more CODEX_HOME profiles."""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_timestamp(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    if not isinstance(value, str):
        return None

    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except ValueError:
        pass

    try:
        parsed_datetime = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed_datetime.tzinfo is None:
        return None
    return parsed_datetime.timestamp()


def reverse_lines(path: Path, chunk_size: int = 65536) -> Iterator[bytes]:
    with path.open("rb") as session:
        session.seek(0, os.SEEK_END)
        position = session.tell()
        remainder = b""
        while position > 0:
            read_size = min(chunk_size, position)
            position -= read_size
            session.seek(position)
            remainder = session.read(read_size) + remainder
            lines = remainder.split(b"\n")
            remainder = lines[0]
            for line in reversed(lines[1:]):
                if line:
                    yield line
        if remainder:
            yield remainder


def latest_in_file(path: Path) -> tuple[float, dict[str, Any], Path] | None:
    latest: tuple[float, dict[str, Any], Path] | None = None
    try:
        for raw_line in reverse_lines(path):
            try:
                event = json.loads(raw_line.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
            if not isinstance(event, dict):
                continue

            payload = event.get("payload")
            if not isinstance(payload, dict):
                continue
            if payload.get("type") != "token_count" or not isinstance(
                payload.get("rate_limits"), dict
            ):
                continue

            observed_at = parse_timestamp(event.get("timestamp"))
            if observed_at is not None and (latest is None or observed_at > latest[0]):
                latest = observed_at, event, path
    except OSError:
        return None
    return latest


def latest_rate_limits(
    sessions_dir: Path, not_before: float
) -> tuple[dict[str, Any], Path, bool] | None:
    session_files: list[tuple[float, Path]] = []
    try:
        for path in sessions_dir.rglob("*.jsonl"):
            try:
                metadata = path.stat()
            except OSError:
                continue
            session_files.append((max(metadata.st_mtime, metadata.st_ctime), path))
    except OSError:
        return None
    session_files.sort(reverse=True)

    latest: tuple[float, dict[str, Any], Path] | None = None
    older_start = len(session_files)
    for index, (changed_at, path) in enumerate(session_files):
        if changed_at < not_before:
            older_start = index
            break
        candidate = latest_in_file(path)
        if candidate is not None and (latest is None or candidate[0] > latest[0]):
            latest = candidate

    if latest is not None:
        return latest[1], latest[2], True

    for _, path in session_files[older_start:]:
        candidate = latest_in_file(path)
        if candidate is not None:
            return candidate[1], candidate[2], False

    return None


def login_mode(codex_home: Path, codex: str) -> str:
    environment = os.environ.copy()
    environment["CODEX_HOME"] = str(codex_home)
    try:
        result = subprocess.run(
            [codex, "login", "status"],
            check=False,
            capture_output=True,
            encoding="utf-8",
            env=environment,
            errors="replace",
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return "unavailable"

    if result.returncode != 0:
        return "unavailable"
    status_lines = [
        line.strip().casefold()
        for output in (result.stdout, result.stderr)
        for line in output.splitlines()
        if line.strip()
    ]
    if any(line.startswith("logged in using chatgpt") for line in status_lines):
        return "chatgpt"
    if any(line.startswith("logged in using an api key") for line in status_lines):
        return "other"
    return "unavailable"


def remaining_percent(window: Any) -> float | None:
    if not isinstance(window, dict):
        return None
    used = window.get("used_percent")
    if isinstance(used, bool) or not isinstance(used, (int, float)):
        return None
    return max(0.0, min(100.0, 100.0 - float(used)))


def sample_profile(
    profile: str,
    codex_home: Path,
    codex: str,
    max_age: int,
) -> dict[str, Any]:
    mode = login_mode(codex_home, codex)
    scan_started_at = datetime.now(timezone.utc).timestamp()
    snapshot = latest_rate_limits(codex_home / "sessions", scan_started_at - max_age)
    sampled_at = datetime.now(timezone.utc).timestamp()
    record: dict[str, Any] = {
        "profile": profile,
        "codex_home": str(codex_home),
        "sampled_at": datetime.fromtimestamp(sampled_at, timezone.utc).isoformat(),
        "login_mode": mode,
        "status": "no_snapshot",
        "schedulable": False,
        "snapshot_at": None,
        "snapshot_age_seconds": None,
        "session_path": None,
        "effective_remaining_percent": None,
        "rate_limits": None,
    }

    if snapshot is None:
        record["status"] = "auth_error" if mode == "unavailable" else "no_snapshot"
        if mode == "other":
            record["status"] = "not_chatgpt"
        return record

    event, session_path, metadata_fresh = snapshot
    observed_at = parse_timestamp(event.get("timestamp"))
    if observed_at is None:
        record["status"] = "invalid_snapshot"
        return record

    rate_limits = event["payload"]["rate_limits"]
    windows = [rate_limits.get("primary"), rate_limits.get("secondary")]
    remaining: list[float] = []
    reset_times: list[float] = []
    malformed_window = False
    for window in windows:
        if window is None:
            continue
        window_remaining = remaining_percent(window)
        if window_remaining is None:
            malformed_window = True
            continue
        remaining.append(window_remaining)
        reset_at = parse_timestamp(window.get("resets_at"))
        if reset_at is None:
            resets_in = window.get("resets_in_seconds")
            if not isinstance(resets_in, bool):
                try:
                    relative_reset = float(resets_in)
                except (TypeError, ValueError):
                    relative_reset = math.nan
                if math.isfinite(relative_reset) and relative_reset >= 0:
                    reset_at = observed_at + relative_reset
        if reset_at is not None:
            reset_times.append(reset_at)
    clock_skew_seconds = observed_at - sampled_at
    age_seconds = max(0, int(-clock_skew_seconds))
    reset_elapsed = any(reset_at <= sampled_at for reset_at in reset_times)
    stale = (
        not metadata_fresh
        or age_seconds > max_age
        or reset_elapsed
        or clock_skew_seconds > 60
    )
    limit_reached = rate_limits.get("rate_limit_reached_type") is not None
    spend_control = bool(rate_limits.get("spend_control_reached"))

    status = "ok"
    if mode == "unavailable":
        status = "auth_error"
    elif mode != "chatgpt":
        status = "not_chatgpt"
    elif not remaining or malformed_window:
        status = "invalid_snapshot"
    elif stale:
        status = "stale"
    elif limit_reached or spend_control or min(remaining) <= 0:
        status = "exhausted"

    record.update(
        {
            "status": status,
            "schedulable": status == "ok",
            "snapshot_at": event.get("timestamp"),
            "snapshot_age_seconds": age_seconds,
            "session_path": str(session_path),
            "effective_remaining_percent": min(remaining) if remaining else None,
            "rate_limits": rate_limits,
        }
    )
    return record


def parse_home(value: str) -> tuple[str, Path]:
    profile, separator, raw_path = value.partition("=")
    if not separator or not profile or not raw_path:
        raise argparse.ArgumentTypeError("expected PROFILE=CODEX_HOME")
    return profile, Path(raw_path).expanduser().resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--home",
        action="append",
        required=True,
        type=parse_home,
        metavar="PROFILE=CODEX_HOME",
        help="profile label and its Codex home; repeat for every app-server",
    )
    parser.add_argument("--codex", default="codex", help="Codex executable (default: codex)")
    parser.add_argument(
        "--max-age",
        required=True,
        type=int,
        metavar="SECONDS",
        help="maximum schedulable snapshot age",
    )
    args = parser.parse_args()
    if args.max_age < 0:
        parser.error("--max-age must be non-negative")

    for profile, codex_home in args.home:
        print(
            json.dumps(
                sample_profile(profile, codex_home, args.codex, args.max_age),
                separators=(",", ":"),
                sort_keys=True,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
