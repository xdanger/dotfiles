"""项目管理与元数据命令: list_projects, download/sync_skills, season_info, mani_events, describe。"""

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from ..config import adplus_headers, default_region, get_adplus_config
from ..http import connection_error, http_request, is_certificate_error, open_url, output
from ..schema import AD_COL_ALIAS_MAP, COL_ALIAS_MAP, ENDPOINT_CAPS
from ..truncate import truncate_response


def cmd_list_projects(args):
    key, base_url = get_adplus_config(args.region)
    params = ["type=all"]
    watch_project_id = getattr(args, "watch_project_id", None)
    watch_project_name = getattr(args, "watch_project_name", None)
    if watch_project_id is not None:
        params.append(f"watchProjectId={urllib.parse.quote(str(watch_project_id))}")
    elif watch_project_name:
        params.append(f"watchProjectName={urllib.parse.quote(str(watch_project_name))}")
    if getattr(args, "search", None):
        params.append(f"search={urllib.parse.quote(args.search)}")
    qs = "?" + "&".join(params)
    url = f"{base_url}/project/accessible-projects{qs}"
    result = http_request("GET", url, adplus_headers(key))
    if isinstance(result, list):
        output(result)
    elif isinstance(result, dict) and "data" in result:
        output(result["data"])
    else:
        output(result)


def cmd_download_skills(args):
    """下载项目的 Skills 配置文件（zip）。"""
    key, base_url = get_adplus_config(args.region)

    url = f"{base_url}/project/skills/download/file?project_id={args.project_id}"
    headers = adplus_headers(key)
    out_path = args.output or f"skills_{args.project_id}.zip"
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with open_url(req, timeout=120) as resp:
            data = resp.read()
            with open(out_path, "wb") as f:
                f.write(data)
        output({"success": True, "file": out_path, "size": len(data)})
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        output({"error": True, "status": e.code, "message": err_body})
    except urllib.error.URLError as e:
        output(connection_error(e.reason))
    except Exception as e:
        output(connection_error(e) if is_certificate_error(e) else {"error": True, "message": str(e)})


def cmd_download_common_skills(args):
    """下载通用知识库（埋点指南）zip 到本地文件。"""
    key, base_url = get_adplus_config(args.region)

    url = f"{base_url}/skills/common/download"
    headers = adplus_headers(key)
    out_path = args.output or "common_skills.zip"
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with open_url(req, timeout=120) as resp:
            data = resp.read()
            with open(out_path, "wb") as f:
                f.write(data)
        output({"success": True, "file": out_path, "size": len(data)})
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        output({"error": True, "status": e.code, "message": err_body})
    except urllib.error.URLError as e:
        output(connection_error(e.reason))
    except Exception as e:
        output(connection_error(e) if is_certificate_error(e) else {"error": True, "message": str(e)})


def cmd_skills_last_modified(args):
    """查询项目 Skills 文件的最后修改时间戳。"""
    key, base_url = get_adplus_config(args.region)

    url = f"{base_url}/project/skills/lastModified?project_id={args.project_id}"
    result = http_request("GET", url, adplus_headers(key))
    output(result)


def cmd_common_skills_last_modified(args):
    """查询通用知识库（埋点指南）的最后修改时间戳。"""
    key, base_url = get_adplus_config(args.region)

    url = f"{base_url}/skills/common/lastModified"
    result = http_request("GET", url, adplus_headers(key))
    output(result)


def _sync_skills_impl(*, key, base_url, local_slot, version_url, download_url, identity, force=False):
    """通用知识库/项目 Skills 同步：版本判断 + 有更新才下载覆盖到本地。

    Args:
        local_slot: 本地目录名（如 "common" 或 "2588"），对应 .tapdb/skills/{slot}/
        version_url: 远端版本查询 URL（返回 {last_modified: ms 时间戳}）
        download_url: 远端 zip 下载 URL
        identity: 输出里的标识字段（如 project_id / slot）
        force: 忽略本地版本，强制重新下载
    """
    import shutil
    import tempfile
    import zipfile

    # 1. 确定 .tapdb 目录位置
    tapdb_dir = os.path.join(os.getcwd(), ".tapdb")
    skills_dir = os.path.join(tapdb_dir, "skills", local_slot)
    version_file = os.path.join(skills_dir, ".skills_version")

    os.makedirs(skills_dir, exist_ok=True)

    # 2. 读取本地 last_modified
    local_ts = 0
    if os.path.exists(version_file):
        try:
            with open(version_file) as f:
                local_ts = int(f.read().strip())
        except (ValueError, OSError):
            local_ts = 0
    if force:
        local_ts = 0

    # 3. 查询远端 last_modified
    result = http_request("GET", version_url, adplus_headers(key))

    if isinstance(result, dict) and result.get("error"):
        output({"action": "skip", "reason": "查询远端版本失败", "detail": result})
        return

    remote_ts = 0
    if isinstance(result, dict):
        data = result.get("data", result)
        if isinstance(data, dict):
            remote_ts = data.get("last_modified", 0)

    if remote_ts == 0:
        # 远端无文件
        output({"action": "skip", "reason": "远端无文件", **identity})
        return

    # 4. 比较版本
    if remote_ts <= local_ts:
        output(
            {
                "action": "up_to_date",
                "local_version": local_ts,
                "remote_version": remote_ts,
                "skills_dir": skills_dir,
                **identity,
            }
        )
        return

    # 5. 下载并解压
    headers = adplus_headers(key)
    try:
        req = urllib.request.Request(download_url, headers=headers, method="GET")
        with open_url(req, timeout=120) as resp:
            zip_data = resp.read()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        output({"action": "error", "reason": "下载失败", "status": e.code, "message": err_body})
        return
    except urllib.error.URLError as e:
        output({"action": "error", **connection_error(e.reason)})
        return
    except Exception as e:
        if is_certificate_error(e):
            output({"action": "error", **connection_error(e)})
        else:
            output({"action": "error", "reason": str(e)})
        return

    # 解压到临时目录再覆盖，确保原子性
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            zip_path = os.path.join(tmp_dir, "skills.zip")
            with open(zip_path, "wb") as f:
                f.write(zip_data)

            extract_dir = os.path.join(tmp_dir, "extracted")
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)

            # 清空目标目录（保留 .skills_version）
            for item in os.listdir(skills_dir):
                if item == ".skills_version":
                    continue
                item_path = os.path.join(skills_dir, item)
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                else:
                    os.remove(item_path)

            # 复制新文件
            for item in os.listdir(extract_dir):
                src = os.path.join(extract_dir, item)
                dst = os.path.join(skills_dir, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)

        # 6. 保存新版本号
        with open(version_file, "w") as f:
            f.write(str(remote_ts))

        output(
            {
                "action": "updated",
                "previous_version": local_ts,
                "new_version": remote_ts,
                "skills_dir": skills_dir,
                "size": len(zip_data),
                **identity,
            }
        )
    except zipfile.BadZipFile:
        output({"action": "error", "reason": "下载的文件不是有效的 zip"})
    except Exception as e:
        output({"action": "error", "reason": f"解压失败: {str(e)}"})


def cmd_sync_skills(args):
    """检查项目 Skills 版本，有更新则下载覆盖到 .tapdb/skills/{project_id}/。"""
    key, base_url = get_adplus_config(args.region)
    project_id = args.project_id

    version_url = f"{base_url}/project/skills/lastModified?project_id={project_id}"
    download_url = f"{base_url}/project/skills/download/file?project_id={project_id}"
    _sync_skills_impl(
        key=key,
        base_url=base_url,
        local_slot=str(project_id),
        version_url=version_url,
        download_url=download_url,
        identity={"project_id": project_id},
    )


def cmd_sync_common_skills(args):
    """检查通用知识库（埋点指南）版本，有更新则下载覆盖到 .tapdb/skills/common/。

    通用知识库是 TapDB 平台级文档（埋点指南），与具体项目无关；
    设计埋点时先运行本命令，把最新版埋点指南同步到本地供参考。
    对应后端接口：/skills/common/lastModified、/skills/common/download
    （ad-plus-api CommonSkillsController）。
    """
    key, base_url = get_adplus_config(args.region)

    version_url = f"{base_url}/skills/common/lastModified"
    download_url = f"{base_url}/skills/common/download"
    _sync_skills_impl(
        key=key,
        base_url=base_url,
        local_slot="common",
        version_url=version_url,
        download_url=download_url,
        identity={"slot": "common", "scope": "通用知识库(埋点指南)"},
        force=getattr(args, "force", False),
    )


def cmd_season_info(args):
    """获取游戏版本/赛季信息。

    调用 /ad-plus/api/season/info 接口，返回项目的赛季/版本信息。
    """
    key, base_url = get_adplus_config(args.region)

    url = f"{base_url}/season/info"
    params = []

    if getattr(args, "project_id", None):
        params.append(f"projectId={args.project_id}")

    if params:
        url += "?" + "&".join(params)

    result = http_request("GET", url, adplus_headers(key))
    if isinstance(result, dict) and "data" in result:
        output(result["data"])
    else:
        output(result)


def cmd_mani_events(args):
    import datetime

    key, base_url = get_adplus_config(args.region)
    url = f"{base_url}/api/v1/ga-mani-event/mani-events"
    body = {"pid": int(args.project_id), "csv": False}
    if getattr(args, "start", None) and getattr(args, "end", None):
        try:
            dt_begin = datetime.datetime.strptime(args.start, "%Y-%m-%d")
            dt_end = datetime.datetime.strptime(args.end, "%Y-%m-%d")
        except ValueError:
            output({"action": "error", "reason": "日期格式错误", "detail": "日期必须是 YYYY-MM-DD 格式"})
            return
        body["dateBegin"] = int(dt_begin.timestamp() * 1000)
        body["dateEnd"] = int((dt_end.timestamp() + 86399) * 1000)
    result = http_request("POST", url, adplus_headers(key), body)
    if not getattr(args, "no_truncate", False):
        result = truncate_response(result, cmd_type="mani_events")
    output(result)


def _describe_argparse_command(name, parser, command_help=None):
    """Build a compact JSON description from an argparse subcommand parser."""
    usage = parser.format_usage().strip()
    if usage.startswith("usage: "):
        usage = usage[len("usage: ") :]
    info = {
        "description": command_help or (parser.description or ""),
        "usage": usage,
    }
    notes = []
    if parser.description and parser.description != info["description"]:
        notes.extend(line.strip() for line in parser.description.splitlines() if line.strip())
    if parser.epilog:
        notes.extend(line.strip() for line in parser.epilog.splitlines() if line.strip())
    if notes:
        info["notes"] = notes

    positionals = []
    options = []
    for action in parser._actions:
        if isinstance(action, argparse._HelpAction):
            continue
        if action.dest == "region" and action.help == argparse.SUPPRESS:
            options.append(
                {
                    "dest": "region",
                    "required": False,
                    "help": (
                        "部署区域: cn(国内) / sg(海外)。用户说 SG/海外/overseas/global 时必须传 -r sg；"
                        "用户说 CN/国内/domestic 时必须传 -r cn。未传时默认读取 "
                        "TAPDB_REGION/TAPDB_MCP_REGION，否则 cn。"
                    ),
                    "flags": list(action.option_strings),
                    "choices": list(action.choices or ("cn", "sg")),
                    "default": default_region(),
                }
            )
            continue
        if action.dest == "no_truncate" and action.help == argparse.SUPPRESS:
            continue

        row = {
            "dest": action.dest,
            "required": bool(getattr(action, "required", False)),
            "help": action.help or "",
        }
        if action.option_strings:
            row["flags"] = list(action.option_strings)
            if getattr(action, "choices", None):
                row["choices"] = list(action.choices)
            default = getattr(action, "default", None)
            if default not in (None, argparse.SUPPRESS):
                row["default"] = default
            options.append(row)
        else:
            row["name"] = action.dest
            row["required"] = action.nargs not in ("?", "*")
            if action.nargs not in (None, argparse.SUPPRESS):
                row["nargs"] = action.nargs
            positionals.append(row)

    if positionals:
        info["positionals"] = positionals
    if options:
        info["options"] = options
    if name in ENDPOINT_CAPS:
        # Preserve the historical `describe active` shape (supported_groups,
        # returned_metrics, notes... at top level), while adding argparse usage/options.
        info.update(_describe_endpoint_cap(name, ENDPOINT_CAPS[name]))
    return info


def _describe_endpoint_cap(name, cap):
    info = {"description": cap["description"]}
    if "quotas" in cap:
        info["quotas"] = cap["quotas"]
    if "subjects" in cap:
        info["subjects"] = cap["subjects"]
    if "groups" in cap:
        alias_map = AD_COL_ALIAS_MAP if name == "ad_data" else COL_ALIAS_MAP
        info["supported_groups"] = [
            {
                "col_name": g,
                "col_alias": alias_map.get(g, g),
                **({"note": cap.get("group_notes", {}).get(g)} if g in cap.get("group_notes", {}) else {}),
            }
            for g in cap["groups"]
        ]
    if "filters" in cap:
        info["supported_filters"] = [
            {
                "col_name": f,
                **({"note": cap.get("filter_notes", {}).get(f)} if f in cap.get("filter_notes", {}) else {}),
            }
            for f in cap["filters"]
        ]
    if "extra_params" in cap:
        info["extra_params"] = cap["extra_params"]
    if "time_field" in cap:
        info["time_field"] = cap["time_field"]
    if "returned_metrics" in cap:
        info["returned_metrics"] = cap["returned_metrics"]
    if "unsupported_note" in cap:
        info["unsupported_note"] = cap["unsupported_note"]
    if "notes" in cap:
        info["notes"] = cap["notes"]
    return info


def cmd_describe(args):
    """输出指定子命令（或全部子命令）的能力/参数描述。"""
    target = args.target
    command_parsers = getattr(args, "_command_parsers", {})
    command_helps = getattr(args, "_command_helps", {})
    command_hidden = getattr(args, "_command_hidden", {})

    visible_commands = [name for name in command_parsers if not command_hidden.get(name)]
    describable = set(command_parsers) | set(ENDPOINT_CAPS)
    if target and target not in describable:
        print(json.dumps({"error": f"未知接口 '{target}'，可选: {visible_commands}"}, ensure_ascii=False))
        return

    if target:
        if target in command_parsers:
            output({target: _describe_argparse_command(target, command_parsers[target], command_helps.get(target))})
        else:
            output({target: _describe_endpoint_cap(target, ENDPOINT_CAPS[target])})
        return

    result = {}
    for name in visible_commands:
        if name == "describe":
            result[name] = {
                "description": command_helps.get(name, "查看各接口支持的指标、分组和过滤条件"),
                "usage": "tapdb_query.py describe [target]",
                "positionals": [{"name": "target", "required": False, "help": "接口/子命令名 (留空查看全部)"}],
            }
        elif name in command_parsers:
            result[name] = _describe_argparse_command(name, command_parsers[name], command_helps.get(name))
        elif name in ENDPOINT_CAPS:
            result[name] = _describe_endpoint_cap(name, ENDPOINT_CAPS[name])

    output(result)
