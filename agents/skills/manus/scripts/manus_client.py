# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx>=0.27.0"]
# ///
"""Generic Manus API client.

Usage:
    uv run manus_client.py create --prompt "..." [options]
    uv run manus_client.py status --task-id <id>
    uv run manus_client.py result --task-id <id> [--download-dir <path>] [--convert]
    uv run manus_client.py list [--limit N] [--status <status>]
    uv run manus_client.py delete --task-id <id>
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from json import JSONDecodeError
from pathlib import Path

import httpx

BASE_URL = "https://api.manus.ai"
STATE_HOME = Path(os.environ.get("MANUS_SKILL_HOME", Path.home() / ".manus-skill"))
REGISTRY_PATH = STATE_HOME / "cache" / "tasks.json"
DEFAULT_MEDIA_DIR = STATE_HOME / "downloads"


def get_api_key() -> str:
    key = os.environ.get("MANUS_API_KEY", "")
    if not key:
        print('{"error": "MANUS_API_KEY not set"}', file=sys.stderr)
        sys.exit(1)
    return key


def api_headers() -> dict[str, str]:
    return {
        "API_KEY": get_api_key(),
        "Content-Type": "application/json",
    }


def media_dir_for_now() -> Path:
    now = datetime.now(timezone.utc)
    d = DEFAULT_MEDIA_DIR / now.strftime("%Y%m")
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_output_path(download_dir: Path, filename: str) -> Path:
    cleaned = Path(filename or "attachment").name
    if not cleaned or cleaned in {".", ".."}:
        cleaned = "attachment"

    candidate = download_dir / cleaned
    stem = candidate.stem or "attachment"
    suffix = candidate.suffix
    index = 1
    while candidate.exists():
        candidate = download_dir / f"{stem}-{index}{suffix}"
        index += 1
    return candidate


def collect_assistant_outputs(data: dict) -> tuple[list[str], list[dict[str, str]]]:
    texts: list[str] = []
    files: list[dict[str, str]] = []

    for entry in data.get("output", []):
        if entry.get("role") != "assistant":
            continue

        for content in entry.get("content", []):
            if content.get("text"):
                texts.append(content["text"])
            if content.get("fileUrl"):
                files.append(
                    {
                        "url": content["fileUrl"],
                        "name": content.get("fileName", "attachment"),
                    }
                )

    return texts, files


# --- Task Registry ---

def load_registry() -> dict:
    if REGISTRY_PATH.exists():
        try:
            return json.loads(REGISTRY_PATH.read_text())
        except (OSError, JSONDecodeError):
            return {}
    return {}


def save_registry(data: dict) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(f"{json.dumps(data, indent=2, ensure_ascii=False)}\n")


def register_task(task_id: str, label: str | None, prompt_summary: str) -> None:
    reg = load_registry()
    reg[task_id] = {
        "label": label or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "prompt_summary": prompt_summary[:200],
        "status": "created",
    }
    save_registry(reg)


def update_task_status(task_id: str, status: str) -> None:
    reg = load_registry()
    if task_id in reg:
        reg[task_id]["status"] = status
        save_registry(reg)


# --- File Upload ---

def upload_file(filepath: str) -> dict[str, str]:
    """Upload a file via presigned URL, return attachment payload."""
    p = Path(filepath)
    if not p.exists():
        print(json.dumps({"error": f"File not found: {filepath}"}), file=sys.stderr)
        sys.exit(1)

    with httpx.Client(timeout=60) as client:
        # Step 1: Get presigned URL
        resp = client.post(
            f"{BASE_URL}/v1/files",
            headers=api_headers(),
            json={"filename": p.name},
        )
        resp.raise_for_status()
        file_info = resp.json()
        file_id = file_info["id"]
        upload_url = file_info["upload_url"]

        # Step 2: PUT file to presigned URL
        with open(p, "rb") as f:
            put_resp = client.put(
                upload_url,
                content=f,
                headers={"Content-Type": "application/octet-stream"},
            )
            put_resp.raise_for_status()

    return {
        "filename": p.name,
        "file_id": file_id,
    }


# --- Subcommands ---

def cmd_create(args: argparse.Namespace) -> None:
    payload: dict = {
        "prompt": args.prompt,
        "agentProfile": args.profile,
    }
    if args.mode:
        payload["taskMode"] = args.mode
    if args.locale:
        payload["locale"] = args.locale
    if args.task_id:
        payload["taskId"] = args.task_id
    if args.interactive:
        payload["interactiveMode"] = True

    # Handle file attachments
    if args.attachment:
        attachments = []
        for fpath in args.attachment:
            attachments.append(upload_file(fpath))
        payload["attachments"] = attachments

    # Handle connectors
    if args.connector:
        payload["connectors"] = args.connector

    with httpx.Client(timeout=120) as client:
        resp = client.post(
            f"{BASE_URL}/v1/tasks",
            headers=api_headers(),
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()

    task_id = result.get("task_id", "")

    if task_id:
        register_task(task_id, args.label, args.prompt)

    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_status(args: argparse.Namespace) -> None:
    params = {"convert": "true"} if args.convert else None
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{BASE_URL}/v1/tasks/{args.task_id}",
            headers=api_headers(),
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status", "unknown")
    update_task_status(args.task_id, status)

    # Return a concise status summary
    summary = {
        "task_id": args.task_id,
        "status": status,
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "credit_usage": data.get("credit_usage"),
    }
    if data.get("error"):
        summary["error"] = data["error"]

    print(json.dumps(summary, indent=2, ensure_ascii=False))


def cmd_result(args: argparse.Namespace) -> None:
    params = {"convert": "true"} if args.convert else None
    with httpx.Client(timeout=60) as client:
        resp = client.get(
            f"{BASE_URL}/v1/tasks/{args.task_id}",
            headers=api_headers(),
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status", "unknown")
    update_task_status(args.task_id, status)

    download_dir = Path(args.download_dir) if args.download_dir else media_dir_for_now()
    download_dir.mkdir(parents=True, exist_ok=True)

    downloaded_files: list[str] = []
    texts, files = collect_assistant_outputs(data)

    for file_info in files:
        dest = safe_output_path(download_dir, file_info["name"])
        # Download assistant-emitted files only. User-uploaded input attachments
        # appear in task output too, but they are not task results.
        with httpx.Client(timeout=120) as dl_client, dl_client.stream(
            "GET",
            file_info["url"],
        ) as dl_resp:
            dl_resp.raise_for_status()
            with open(dest, "wb") as out:
                for chunk in dl_resp.iter_bytes():
                    out.write(chunk)
        downloaded_files.append(str(dest))

    result = {
        "task_id": args.task_id,
        "status": status,
        "text": "\n\n".join(texts) if texts else None,
        "files": downloaded_files,
        "credit_usage": data.get("credit_usage"),
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Emit file paths on stderr for callers that want to inspect downloads.
    for fpath in downloaded_files:
        print(f"MEDIA:{fpath}", file=sys.stderr)


def cmd_list(args: argparse.Namespace) -> None:
    params: dict = {"limit": args.limit, "order": "desc"}
    if args.status:
        params["status"] = args.status

    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{BASE_URL}/v1/tasks",
            headers=api_headers(),
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    tasks = []
    for t in data.get("data", []):
        tasks.append({
            "task_id": t.get("id"),
            "status": t.get("status"),
            "created_at": t.get("created_at"),
            "credit_usage": t.get("credit_usage"),
        })

    print(json.dumps({"tasks": tasks, "has_more": data.get("has_more", False)}, indent=2, ensure_ascii=False))


def cmd_delete(args: argparse.Namespace) -> None:
    with httpx.Client(timeout=30) as client:
        resp = client.delete(
            f"{BASE_URL}/v1/tasks/{args.task_id}",
            headers={"API_KEY": get_api_key()},
        )
        resp.raise_for_status()
        data = resp.json()

    update_task_status(args.task_id, "deleted")
    print(json.dumps(data, indent=2, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generic Manus API client")
    sub = parser.add_subparsers(dest="command", required=True)

    # create
    p_create = sub.add_parser("create", help="Create a Manus task")
    p_create.add_argument("--prompt", required=True, help="Task prompt")
    p_create.add_argument("--mode", choices=["agent", "adaptive", "chat"], default="agent")
    p_create.add_argument("--profile", default="manus-1.6", choices=["manus-1.6", "manus-1.6-lite", "manus-1.6-max"])
    p_create.add_argument("--label", default=None, help="Optional local label stored in the task registry")
    p_create.add_argument("--attachment", action="append", help="File path to attach (repeatable)")
    p_create.add_argument("--connector", action="append", help="Connector UUID (repeatable)")
    p_create.add_argument("--locale", default=None, help="Locale (e.g., zh-CN, en-US)")
    p_create.add_argument("--task-id", default=None, help="Existing task ID for multi-turn continuation")
    p_create.add_argument("--interactive", action="store_true", help="Allow Manus to ask follow-up questions")

    # status
    p_status = sub.add_parser("status", help="Check task status")
    p_status.add_argument("--task-id", required=True, help="Task ID")
    p_status.add_argument("--convert", action="store_true", help="Convert PPTX output when supported by Manus")

    # result
    p_result = sub.add_parser("result", help="Get task result and download attachments")
    p_result.add_argument("--task-id", required=True, help="Task ID")
    p_result.add_argument("--download-dir", default=None, help="Directory for downloads (default: ~/.manus-skill/downloads/YYYYMM/)")
    p_result.add_argument("--convert", action="store_true", help="Convert PPTX output when supported by Manus")

    # list
    p_list = sub.add_parser("list", help="List recent tasks")
    p_list.add_argument("--limit", type=int, default=10, help="Max tasks to return")
    p_list.add_argument("--status", default=None, help="Filter by status")

    # delete
    p_delete = sub.add_parser("delete", help="Delete a task via Manus API")
    p_delete.add_argument("--task-id", required=True, help="Task ID")

    # Backward-compatible alias for older skill docs. This deletes the task.
    p_cancel = sub.add_parser("cancel", help="Deprecated alias of delete")
    p_cancel.add_argument("--task-id", required=True, help="Task ID")

    args = parser.parse_args()

    handlers = {
        "create": cmd_create,
        "status": cmd_status,
        "result": cmd_result,
        "list": cmd_list,
        "delete": cmd_delete,
        "cancel": cmd_delete,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()
