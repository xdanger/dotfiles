"""CLI 定义: argparse 子命令注册与 main() 入口。"""

import argparse
import sys
from typing import NoReturn

from .commands.bury_point import (
    cmd_bury_point_error_detail,
    cmd_bury_point_overview,
    cmd_bury_point_real_time_detail,
    cmd_bury_point_real_time_status,
    cmd_bury_point_real_time_switch,
)
from .commands.metrics import (
    cmd_active,
    cmd_ad_data,
    cmd_ad_monet,
    cmd_cost,
    cmd_income,
    cmd_life_cycle,
    cmd_op_overview,
    cmd_player_behavior,
    cmd_raw,
    cmd_retention,
    cmd_source,
    cmd_user_value,
    cmd_version_distri,
    cmd_whale_user,
)
from .commands.project import (
    cmd_common_skills_last_modified,
    cmd_describe,
    cmd_download_common_skills,
    cmd_download_skills,
    cmd_list_projects,
    cmd_mani_events,
    cmd_season_info,
    cmd_skills_last_modified,
    cmd_sync_common_skills,
    cmd_sync_skills,
)
from .commands.v2 import (
    cmd_cluster_edit,
    cmd_cluster_save,
    cmd_dashboard_add_reports,
    cmd_dashboard_analysis,
    cmd_dashboard_detail,
    cmd_dashboard_report_setting,
    cmd_dashboard_save,
    cmd_dashboard_save_share,
    cmd_dashboard_share_detail,
    cmd_event_analysis,
    cmd_event_edit,
    cmd_event_properties,
    cmd_event_quotas,
    cmd_event_save,
    cmd_folder_list,
    cmd_folder_save,
    cmd_list_clusters,
    cmd_list_events,
    cmd_list_props,
    cmd_list_tags,
    cmd_property_edit,
    cmd_property_save,
    cmd_report_detail,
    cmd_report_edit,
    cmd_report_list,
    cmd_report_save,
    cmd_tag_edit,
    cmd_tag_info,
    cmd_tag_save,
    cmd_virtual_property_save,
)
from .config import default_region, normalize_region
from .http import output
from .project_access import verify_project_access_or_exit
from .schema import ENDPOINT_CAPS

COMMON_GROUP_BY_HELP = "分组字段（不同子命令支持不同字段，建议先用 describe <命令> 查看）"
COST_GROUP_BY_HELP = (
    "分组字段（买量成本专用）: dt, media, media_source, os, country, country_code, "
    "province, city, channel, campaign_id, ad_id, creative_id, account_id, "
    "material_id, ad_platform_id, app_id, tap_app_id, opt_obj, scene, "
    "scene_final, google_opt_obj, china_opt_obj, project_name"
)
REPORT_QP_RULES = """\
正确用法:
- --qp 必须用 list_events / list_props 返回的真实 eventId、eventName、eventDesc、analysis、属性名构建。
- report_save / report_edit 会重新读取事件目录，原子校验并补齐 eventId + eventName + eventDesc；
  缺少 eventDesc、事件不存在或 ID/名称不匹配时停止写入，并同步修复 reportRestore 中的事件引用。
- report_save / report_edit 会用 /event/quotas 与按事件过滤的 /event/properties 做写入前校验。
- event 模型 qp 包含 events + eventView；由 report_save 自动生成 reportRestore。
- 属性聚合指标必须同时包含属性 quota 与聚合 analysis，例如 {"quota":"duration","analysis":"median"}。
- 多事件会自动补 splitEvents；多事件、splitEvents 或公式报表没有 groupBy 时会自动补事件时间维度。
- groupBy 不含事件时间 time 时会强制 timeParticleSize=total；
  包含 time 时会使用非 total 粒度并同步 timeTypeColumnFormat。
- reportRestore.global 会自动包含所有唯一事件，公式会生成 type=formula 和 formulaData.items。
- 公式 customEvent 使用 event.metric 或 event.property.metric；数值属性必须写完整三段，如 charge.#vp@amount.sum。
- 虚拟属性 #vp@... 优先放 eventView.globalFilters 或 eventView.groupBy；单指标 filters 仅复用已验证前端结构。
- 创建后可先用 event_analysis 验证查询；加入看板后用 report_detail 检查事件描述恢复结构，再用 dashboard_analysis 验证。
"""
REPORT_QP_HELP = (
    "查询参数 JSON。event 模型必须包含 events + eventView；"
    "事件 eventId/eventName/eventDesc 必须来自同一条元数据；"
    "report_save 会补齐事件描述、规范化 splitEvents/groupBy 并生成 reportRestore。"
)
ANALYSIS_QP_HELP = (
    "查询参数 JSON。event 模型包含 events + eventView；命令会复用 report_save 的 splitEvents/groupBy 规范化逻辑。"
)

_UNSUPPORTED_NL_COMMANDS = {"natural_language_role_data_query"}


class TapdbArgumentParser(argparse.ArgumentParser):
    """argparse variant that returns structured JSON on CLI misuse."""

    def error(self, message) -> NoReturn:
        command = _current_command_from_argv()
        payload = {
            "error": True,
            "code": "invalid_cli_args",
            "message": message,
            "command": command,
            "hint": _cli_error_hint(command, message),
        }
        output(payload, exit_code=2)


def _current_command_from_argv():
    if len(sys.argv) <= 1:
        return ""
    known_options_with_values = {"-r", "--region"}
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--":
            return sys.argv[i + 1] if i + 1 < len(sys.argv) else ""
        if arg in known_options_with_values:
            i += 2
            continue
        if arg.startswith("--region="):
            i += 1
            continue
        if arg.startswith("-"):
            i += 1
            continue
        return arg
    return ""


def _cli_error_hint(command, message):
    if command in _UNSUPPORTED_NL_COMMANDS:
        return "TapDB CLI 不支持自然语言伪命令；请使用已有指标或 TapDB 2.0 事件分析子命令。"
    if command == "player_behavior" and "--event-name" in sys.argv:
        return "player_behavior 不支持 --event-name；查自定义事件请用 event_analysis。"
    if command == "ad_data" and "--limit" in sys.argv:
        return "ad_data 当前已兼容 --limit；如仍报错，请确认 --quotas 用逗号分隔，例如 --quotas cost,display。"
    return "请先运行 `describe` 或 `describe <cmd>` 查看支持的命令和参数，不要猜测命令名/参数。"


def _reject_unsupported_commands():
    command = _current_command_from_argv()
    if command in _UNSUPPORTED_NL_COMMANDS:
        output(
            {
                "error": True,
                "code": "unsupported_natural_language_command",
                "message": f"TapDB CLI 不支持自然语言伪命令 `{command}`。",
                "hint": _cli_error_hint(command, ""),
            },
            exit_code=2,
        )


def _normalize_region_in_argv():
    """Pre-parse sys.argv to normalize -r/--region values before argparse.

    This catches LLM misinputs like ``-r domestic`` or ``--region=overseas``
    that would otherwise cause argparse to exit(2) with an unhelpful error.
    """
    i = 1  # skip script name
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg in ("-r", "--region"):
            if i + 1 < len(sys.argv):
                val = sys.argv[i + 1]
                norm = normalize_region(val)
                if norm and norm != val:
                    sys.argv[i + 1] = norm
                i += 2
                continue
        elif arg.startswith("--region="):
            _, val = arg.split("=", 1)
            norm = normalize_region(val)
            if norm and norm != val:
                sys.argv[i] = f"--region={norm}"
        elif arg.startswith("-r") and len(arg) > 2 and not arg.startswith("-r "):
            # -rdomestic 或 -r=domestic
            rest = arg[2:].lstrip("=")
            norm = normalize_region(rest)
            if norm and norm != rest:
                sys.argv[i] = f"-r{norm}"
        i += 1


def add_common_args(p, group_by_help=COMMON_GROUP_BY_HELP):
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", required=True, help="开始日期 YYYY-MM-DD")
    p.add_argument("-e", "--end", required=True, help="结束日期 YYYY-MM-DD")
    p.add_argument("-g", "--group-by", help=group_by_help)
    p.add_argument("--group-unit", default="day", help="时间分组粒度: hour|day|week|month (默认 day)")
    p.add_argument("--group-dim", help="分组维度名(国家/地区用cy, 次大陆用scon)")
    p.add_argument(
        "--language",
        default="cn",
        choices=["cn", "en", "tw", "jp"],
        help="语言(分组为国家/地区/中国大陆时必填, 默认 cn)",
    )
    p.add_argument(
        "--filters",
        help=(
            "过滤条件JSON, 例: "
            '\'[{"col_name":"activation_os","data_type":"string","calculate_symbol":"include","ftv":["Android"]}]\''
        ),
    )
    p.add_argument("--charge-subject", default="user", help="付费主体: user|device (默认 user)")
    p.add_argument(
        "--exchange-to-currency",
        default="CNY",
        help="金额转换目标货币代码 (默认 CNY; 常用: CNY/USD/JPY/EUR; 传 none 禁用转换)",
    )
    p.add_argument("--de-water", action="store_true", help="去水(默认不去水)")
    p.add_argument("--no-cache", action="store_true", help="不使用缓存")
    p.add_argument("--limit", type=int, help="结果数量上限 (默认 5000)")


def validate_group_by(command, group_by):
    """Reject unsupported explicit group fields before loading credentials."""
    if not group_by:
        return

    supported_groups = ENDPOINT_CAPS.get(command, {}).get("groups")
    if supported_groups is None or group_by in supported_groups:
        return

    output(
        {
            "error": True,
            "message": f"{command} 接口不支持按 '{group_by}' 分组",
            "supported_groups": supported_groups,
            "hint": f"请先运行 describe {command} 查看接口能力",
        },
        exit_code=2,
    )


def main():
    _reject_unsupported_commands()
    parser = TapdbArgumentParser(
        description="TapDB 数据查询工具 - 查询游戏运营数据(活跃/留存/付费/来源等)",
        epilog="""
常用命令快速参考：
-------------------
# 基础命令
python3 <SKILL_DIR>/scripts/tapdb_query.py list_projects                    # 列出项目（-r sg 查海外）
python3 <SKILL_DIR>/scripts/tapdb_query.py describe active                  # 查看接口能力（不带参数查全部）
python3 <SKILL_DIR>/scripts/tapdb_query.py season_info -p <project_id>      # 获取游戏版本/赛季信息
python3 <SKILL_DIR>/scripts/tapdb_query.py mani_events -p <project_id>      # 获取运营事件列表（不传时间查全部）

# 活跃 (DAU/WAU/MAU) — 时间字段用 time，--quota 支持多个空格分隔
python3 <SKILL_DIR>/scripts/tapdb_query.py active -p <id> -s <start> -e <end> \
  --quota dau wau mau -g time --group-unit day
python3 <SKILL_DIR>/scripts/tapdb_query.py active -p <id> -s <start> -e <end> --quota dau -g time --group-unit day

# 运营概览（新版概览缓存表）— quota: income|active|activation, interval: minute|hour|day|week|month
python3 <SKILL_DIR>/scripts/tapdb_query.py op_overview -p <id> -s <start> -e <end> --quota active --interval day

# 留存 — 时间字段用 activation_time（⚠️ 没有 --quota 参数；不要传 --group-unit week/month）
python3 <SKILL_DIR>/scripts/tapdb_query.py retention -p <id> -s <start> -e <end> -g activation_time --group-unit day

# 收入 — 时间字段用 time（❌ 不能用 activation_time，会 500）
python3 <SKILL_DIR>/scripts/tapdb_query.py income -p <id> -s <start> -e <end> -g time --group-unit week

# 来源/新增 — 时间字段用 activation_time
python3 <SKILL_DIR>/scripts/tapdb_query.py source -p <id> -s <start> -e <end> -g activation_time --group-unit day

# 买量成本 — 时间字段用 dt
python3 <SKILL_DIR>/scripts/tapdb_query.py cost -p <id> -s <start> -e <end> -g dt

# 维度下钻（按渠道/国家等）
python3 <SKILL_DIR>/scripts/tapdb_query.py active -p <id> -s <start> -e <end> \
  --quota dau -g activation_channel --limit 10

# 获取运营事件列表（不传时间查全部，分析前未指定时间时直接查全部，无需确认）
python3 <SKILL_DIR>/scripts/tapdb_query.py mani_events -p <id>
# 如需指定时间范围: mani_events -p <id> -s <start> -e <end>

# 获取全量可分析的事件列表:
python3 <SKILL_DIR>/scripts/tapdb_query.py list_events -p <id>

# 获取全量属性字典 (账号属性/设备属性/事件属性等):
python3 <SKILL_DIR>/scripts/tapdb_query.py list_props -p <id>

# 获取游戏版本/赛季信息
python3 <SKILL_DIR>/scripts/tapdb_query.py season_info -p <id>
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    region_default = default_region()
    parser.add_argument(
        "-r",
        "--region",
        default=region_default,
        choices=["cn", "sg"],
        help=(
            "部署区域: cn(国内) / sg(海外) "
            f"(默认 {region_default}; 可由 TAPDB_REGION/TAPDB_MCP_REGION 设置)"
        ),
    )
    parser.add_argument(
        "--no-truncate", action="store_true", help="输出完整数据，不截断（默认自动截断长数据以节省上下文）"
    )
    sub = parser.add_subparsers(dest="command", required=True, parser_class=TapdbArgumentParser)

    # 包装 sub.add_parser，自动给每个子命令注入全局参数（-r, --no-truncate）
    # 这样无论放在子命令前后都能识别。
    # 同时记录子命令 parser 元数据，使 `describe <cmd>` 覆盖所有子命令，
    # 避免一部分命令只能靠 `<cmd> --help` 查看参数而造成使用方式不一致。
    command_parsers = {}
    command_helps = {}
    command_hidden = {}
    _orig_add_parser = sub.add_parser

    def _add_parser_with_globals(*a, **kw):
        p = _orig_add_parser(*a, **kw)
        if a:
            name = str(a[0])
            help_text = kw.get("help")
            command_parsers[name] = p
            command_hidden[name] = help_text == argparse.SUPPRESS
            if help_text is not None and help_text != argparse.SUPPRESS:
                command_helps[name] = str(help_text)
            if help_text == argparse.SUPPRESS:
                choices_actions = getattr(sub, "_choices_actions", [])
                sub._choices_actions = [action for action in choices_actions if getattr(action, "dest", None) != name]
        p.add_argument("-r", "--region", default=argparse.SUPPRESS, choices=["cn", "sg"], help=argparse.SUPPRESS)
        p.add_argument("--no-truncate", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        p.add_argument("--watch-project-id", type=int, default=argparse.SUPPRESS, help="按项目 ID 受控追加可访问项目")
        p.add_argument("--watch-project-name", default=argparse.SUPPRESS, help="按完整项目名受控追加唯一命中的项目")
        return p

    sub.add_parser = _add_parser_with_globals

    p = sub.add_parser("list_projects", help="列出当前可访问的项目")
    p.add_argument("-s", "--search", help="按项目名/标签/备注搜索过滤")

    # download_skills
    p = sub.add_parser("download_skills", help="下载项目的 Skills 配置文件(zip)")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-o", "--output", help="输出文件路径 (默认 skills_<project_id>.zip)")

    # download_common_skills
    p = sub.add_parser("download_common_skills", help="下载通用知识库(埋点指南) zip 到本地文件")
    p.add_argument("-o", "--output", help="输出文件路径 (默认 common_skills.zip)")

    # skills_last_modified
    p = sub.add_parser("skills_last_modified", help="查询项目 Skills 的最后修改时间")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")

    # common_skills_last_modified
    p = sub.add_parser("common_skills_last_modified", help="查询通用知识库(埋点指南)的最后修改时间")

    # sync_skills
    p = sub.add_parser("sync_skills", help="检查并同步项目 Skills 到本地 .tapdb 目录")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")

    # sync_common_skills
    p = sub.add_parser("sync_common_skills", help="同步通用知识库(埋点指南)到本地 .tapdb/skills/common/（每次判断版本，有更新才下载）")
    p.add_argument("-f", "--force", action="store_true", help="忽略本地版本，强制重新下载")

    # season_info
    p = sub.add_parser("season_info", help="获取游戏版本/赛季信息")
    p.add_argument("-p", "--project-id", help="项目ID (可选)")

    # mani_events
    p = sub.add_parser("mani_events", help="运营事件: 获取运营事件列表(不传时间则查全部)")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", help="开始日期 YYYY-MM-DD (可选)")
    p.add_argument("-e", "--end", help="结束日期 YYYY-MM-DD (可选)")

    # active
    p = sub.add_parser("active", help="活跃数据: DAU/WAU/MAU/HAU")
    add_common_args(p)
    p.add_argument(
        "--subject",
        default="device",
        choices=["device", "user"],
        help="统计维度 (默认 device; 用户问'用户''人数'时用 user)",
    )
    p.add_argument(
        "--quota",
        default=["dau"],
        nargs="+",
        choices=["dau", "wau", "mau", "hau"],
        help="活跃指标，支持多个 (默认 dau)。例: --quota dau wau mau",
    )

    # op_overview
    p = sub.add_parser("op_overview", help="运营概览: 收入/活跃/新增")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", required=True, help="开始日期 YYYY-MM-DD")
    p.add_argument("-e", "--end", required=True, help="结束日期 YYYY-MM-DD")
    p.add_argument(
        "--interval",
        default="day",
        choices=["minute", "hour", "day", "week", "month"],
        help="概览粒度: minute|hour|day|week|month (默认 day)",
    )
    p.add_argument(
        "--quota",
        default="active",
        choices=["income", "active", "activation"],
        help="概览指标: income(收入)|active(活跃)|activation(新增) (默认 active)",
    )
    p.add_argument("--compared-date", help="对比日期 YYYY-MM-DD；minute/hour 粒度必填")
    p.add_argument("--tz-offset", type=int, default=8, help="时区偏移 (默认 8)")
    p.add_argument("--no-cache", action="store_true", help="不使用缓存")

    # bury point overview and diagnostics
    p = sub.add_parser("bury_point_overview", help="埋点概览: 接收/入库/异常/失败汇总")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", required=True, help="开始时间 YYYY-MM-DD[ HH:MM:SS]")
    p.add_argument("-e", "--end", required=True, help="结束时间 YYYY-MM-DD[ HH:MM:SS]")

    p = sub.add_parser("bury_point_error_detail", help="埋点错误明细: 按事件查询错误字段和错误码")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", required=True, help="开始时间 YYYY-MM-DD[ HH:MM:SS]")
    p.add_argument("-e", "--end", required=True, help="结束时间 YYYY-MM-DD[ HH:MM:SS]")
    p.add_argument("--event-name", required=True, help="事件名；优先使用 bury_point_overview 返回的 eventName")

    p = sub.add_parser("bury_point_real_time_status", help="埋点实时监测: 查询开关状态")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")

    p = sub.add_parser("bury_point_real_time_detail", help="埋点实时监测: 查询上报明细")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")

    p = sub.add_parser("bury_point_real_time_switch", help="埋点实时监测: 开启或关闭上报明细")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("--status", required=True, choices=["on", "off"], help="开关状态")
    p.add_argument(
        "--wait-seconds",
        type=int,
        default=10,
        help="开启后等待系统生效的秒数 (默认 10；关闭时忽略)",
    )

    # retention
    p = sub.add_parser("retention", help="留存数据: DR1-DR180 / WR / MR")
    add_common_args(p)
    p.add_argument("--subject", default="device", choices=["device", "user"], help="统计维度 (默认 device)")
    p.add_argument(
        "--interval-unit", default="day", choices=["day", "week", "month"], help="留存间隔: day|week|month (默认 day)"
    )
    p.add_argument("--percent", default=True, type=lambda x: x.lower() != "false", help="返回百分比数据 (默认 true)")
    p.add_argument("--all-retention", action="store_true", help="返回所有留存指标(DR1-DR180); 默认只返回关键指标")

    # income
    p = sub.add_parser("income", help="收入数据: 收入/付费人数/ARPU/ARPPU")
    add_common_args(p)

    # source
    p = sub.add_parser("source", help="来源数据: 新增设备/用户/转化率")
    add_common_args(p)

    # player_behavior
    p = sub.add_parser("player_behavior", help="玩家行为: 游戏时长/启动次数")
    add_common_args(p)
    p.add_argument("--quota", default="behavior", choices=["behavior", "duration"], help="指标类型 (默认 behavior)")
    p.add_argument(
        "--duration-unit", default="minute", choices=["minute", "10_minute", "hour"], help="时长单位 (默认 minute)"
    )

    # version_distri
    p = sub.add_parser("version_distri", help="版本分布: 各版本活跃设备数")
    add_common_args(p)

    # user_value (LTV)
    p = sub.add_parser("user_value", help="用户价值(LTV): N日贡献")
    add_common_args(p)

    # whale_user
    p = sub.add_parser("whale_user", help="鲸鱼用户: 高付费用户排行")
    add_common_args(p)

    # life_cycle
    p = sub.add_parser("life_cycle", help="用户生命周期: 付费转化/金额/累计")
    add_common_args(p)
    p.add_argument(
        "--quota",
        default="payment_amount",
        choices=["payment_cvs_rate", "payment_cvs", "payment_amount", "acc_payment"],
        help="生命周期指标 (默认 payment_amount)",
    )

    # cost
    p = sub.add_parser("cost", help="买量成本数据: 花费/展示/点击/获客/留存/ROI")
    add_common_args(p, group_by_help=COST_GROUP_BY_HELP)

    # ad_data (广告投放/买量)
    p = sub.add_parser("ad_data", help="广告投放(买量)数据: 花费/展示/点击/激活/留存/LTV")
    p.add_argument("-p", "--project-id", required=True, help="项目ID")
    p.add_argument("-s", "--start", required=True, help="开始日期 YYYY-MM-DD")
    p.add_argument("-e", "--end", required=True, help="结束日期 YYYY-MM-DD")
    p.add_argument(
        "-g",
        "--group-by",
        default="time",
        help="分组: time/platform_id/advertisement_id/tag_id/first_ad_sub_channel1-5 (默认 time)",
    )
    p.add_argument("--quotas", required=True, help="逗号分隔指标列表 (如 cost,display,activation,activationCost)")
    p.add_argument("--ad-increment", default="true", help="仅广告增量 (默认 true; false 包含自然量)")
    p.add_argument("--tz-offset", type=int, default=8, help="时区偏移 (默认 8, 即 UTC+8)")
    p.add_argument("--sort-field", help="排序字段 (如 cost, activation)")
    p.add_argument("--sort-order", default="desc", choices=["asc", "desc"], help="排序方向 (默认 desc)")
    p.add_argument("--filters", help="过滤条件JSON")
    p.add_argument("--limit", type=int, help="结果数量上限（兼容参数；内部设置 page_size，默认 5000）")
    p.add_argument("--charge-subject", default="user", choices=["user", "device"], help="付费主体 (默认 user)")
    p.add_argument("--exchange-to-currency", default="CNY", help="金额目标货币 (如 USD/CNY/JPY，默认CNY)")

    # ad_monet
    p = sub.add_parser("ad_monet", help="广告变现数据")
    add_common_args(p)

    # describe
    p = sub.add_parser("describe", help="查看各接口支持的指标、分组和过滤条件")
    p.add_argument("target", nargs="?", help="接口名 (留空查看全部)")

    # raw is kept as an explicit debugging escape hatch, but hidden from normal
    # command discovery so metric queries use typed subcommands.
    p = sub.add_parser("raw", help=argparse.SUPPRESS)
    p.add_argument("path", help="MCP API路径（仅调试用）")
    p.add_argument("body", nargs="?", help="JSON请求体")

    # ── TapDB 2.0 事件分析子命令 (evtapi) ────────────────────

    def add_evtapi_common(p):
        p.add_argument("-p", "--project-id", required=True, help="项目ID")

    # list_events
    p = sub.add_parser("list_events", help="[2.0] 列出事件列表 (物理/衍生/虚拟)")
    add_evtapi_common(p)
    p.add_argument(
        "--flat", action="store_true", help="输出扁平事件数组，并附带 eventCategory 字段，便于 jq/python 处理"
    )
    p.add_argument(
        "-k",
        "--keyword",
        action="append",
        default=[],
        help="按关键字过滤 eventName/eventDesc (大小写不敏感, 可多次传入做 OR 匹配)。"
        "示例: -k 抽卡 -k gacha -k 卡池。"
        "命中任一关键字即返回；启用过滤会自动 flat 输出。",
    )
    p.add_argument(
        "--min-recent",
        type=int,
        default=None,
        help="只返回 recentlyDataNum >= 该阈值的事件 (用于过滤近期无数据的事件)。启用后自动 flat 输出。",
    )

    # list_props
    p = sub.add_parser("list_props", help="[2.0] 列出属性列表 (事件/账号/设备/用户)")
    add_evtapi_common(p)
    p.add_argument(
        "-t",
        "--table-type",
        type=int,
        default=0,
        choices=[0, 1, 2, 4],
        help="表类型: 0=事件 1=账号 2=设备 4=用户(含账号+设备) (默认 0)",
    )

    # 2.0 physical event/property metadata writes
    p = sub.add_parser("event_save", help="[2.0] 新增物理自定义事件")
    add_evtapi_common(p)
    p.add_argument("--event-name", required=True, help="事件名；创建后不可通过该命令修改")
    p.add_argument("--display-name", "--event-desc", dest="event_desc", required=True, help="事件显示名")
    p.add_argument("--prop-ids", help="关联的物理事件属性 ID，逗号分隔；省略表示不关联")
    p.add_argument("--data-switch", default="on", choices=["on", "off"], help="数据接收开关 (默认 on)")
    p.add_argument("--status", default="display", choices=["display", "hide"], help="状态 (默认 display)")
    p.add_argument("--remarks", "--remark", dest="remarks", default="", help="事件说明 (最多 100 字符)")

    p = sub.add_parser("event_edit", help="[2.0] 修改物理事件显示信息和属性关联")
    add_evtapi_common(p)
    p.add_argument("--event-id", required=True, type=int, help="事件 ID (来自 list_events)")
    p.add_argument("--display-name", "--event-desc", dest="event_desc", help="新的事件显示名；省略则保留")
    p.add_argument(
        "--prop-ids",
        help="完整的关联属性 ID 列表，逗号分隔；省略则保留，传空字符串可清空",
    )
    p.add_argument("--data-switch", choices=["on", "off"], help="数据接收开关；省略则保留")
    p.add_argument("--status", choices=["display", "hide"], help="状态；省略则保留")
    p.add_argument("--remarks", "--remark", dest="remarks", help="新的事件说明；省略则保留")

    def add_physical_property_args(parser, *, edit: bool = False):
        if edit:
            parser.add_argument("--prop-id", required=True, type=int, help="属性 ID (来自 list_props)")
            parser.add_argument("--display-name", "--column-desc", dest="column_desc", help="新的属性显示名")
            parser.add_argument("--unit", help="新的单位；省略则保留")
            parser.add_argument("--data-switch", choices=["on", "off"], help="数据接收开关；省略则保留")
            parser.add_argument("--status", choices=["display", "hide"], help="状态；省略则保留")
            parser.add_argument("--remarks", "--remark", dest="remarks", help="新的属性说明；省略则保留")
            return
        parser.add_argument(
            "--table-type",
            required=True,
            type=int,
            choices=[0, 1, 2],
            help="属性主体: 0=事件 1=账号 2=设备",
        )
        parser.add_argument("--column-name", required=True, help="属性名；创建后不可修改")
        parser.add_argument("--display-name", "--column-desc", dest="column_desc", required=True, help="属性显示名")
        parser.add_argument(
            "--column-type",
            required=True,
            choices=["varchar", "double", "integer", "bigint", "boolean", "timestamp"],
            help="存储类型；必须与 --select-type 匹配",
        )
        parser.add_argument(
            "--select-type",
            required=True,
            choices=["string", "array_string", "number", "bool", "datetime"],
            help="分析类型；必须与 --column-type 匹配",
        )
        parser.add_argument("--unit", default="", help="单位 (最多 100 字符)")
        parser.add_argument("--data-switch", default="on", choices=["on", "off"], help="数据接收开关 (默认 on)")
        parser.add_argument("--status", default="display", choices=["display", "hide"], help="状态 (默认 display)")
        parser.add_argument("--remarks", "--remark", dest="remarks", default="", help="属性说明 (最多 100 字符)")

    p = sub.add_parser("property_save", help="[2.0] 新增物理自定义属性")
    add_evtapi_common(p)
    add_physical_property_args(p)

    p = sub.add_parser("property_edit", help="[2.0] 修改物理属性显示信息")
    add_evtapi_common(p)
    add_physical_property_args(p, edit=True)

    # event_quotas
    p = sub.add_parser("event_quotas", help="[2.0] 获取事件分析可用指标 (/event/quotas)")
    add_evtapi_common(p)
    p.add_argument("--event-model", default="event", help="报表模型 (默认 event)")

    # event_properties
    p = sub.add_parser("event_properties", help="[2.0] 获取指定事件可用属性 (/event/properties)")
    add_evtapi_common(p)
    p.add_argument("--event-model", default="event", help="报表模型 (默认 event)")
    p.add_argument("--event-ids", help="事件 ID，多个用逗号分隔")
    p.add_argument("--event-names", help="事件名，多个用逗号分隔")
    p.add_argument("--subject", help="主体过滤 (可选)")

    # virtual_property_save
    p = sub.add_parser("virtual_property_save", help="[2.0] 校验并新建计算虚拟属性")
    add_evtapi_common(p)
    p.add_argument(
        "--table-type",
        required=True,
        type=int,
        choices=[0, 1, 2],
        help="属性主体: 0=事件 1=账号 2=设备",
    )
    p.add_argument("--column-name", required=True, help="属性名；可省略 #vp@ 前缀")
    p.add_argument("--display-name", "--column-desc", dest="column_desc", required=True, help="属性显示名")
    p.add_argument(
        "--column-type",
        required=True,
        choices=["varchar", "double", "integer", "bigint", "boolean", "timestamp"],
        help="存储类型",
    )
    p.add_argument(
        "--select-type",
        required=True,
        choices=["string", "array_string", "number", "bool", "datetime"],
        help="分析类型；必须与 --column-type 匹配",
    )
    p.add_argument("--sql", "--column-rule", dest="column_rule", required=True, help="虚拟属性 SQL 表达式")
    p.add_argument("--unit", default="", help="单位 (可选，最多 100 字符)")
    p.add_argument("--remarks", "--remark", dest="remarks", default="", help="说明 (可选，最多 100 字符)")
    p.add_argument("--status", default="display", choices=["display", "hide"], help="状态 (默认 display)")
    p.add_argument(
        "--relation-type",
        type=int,
        choices=[0, 1, 2],
        help="事件关联: 0=自动识别 1=全部事件 2=指定事件；事件属性默认 0",
    )
    p.add_argument(
        "--relation-table-type",
        type=int,
        choices=[0, 1, 2],
        help="事件属性关联主体: 0=无 1=账号 2=设备；事件属性默认 0",
    )
    p.add_argument("--event-ids", help="指定事件 ID，逗号分隔；仅用于 --relation-type 2")
    p.add_argument("--dry-run", action="store_true", help="只执行 SQL 校验并输出规范化 payload，不创建")

    # list_clusters
    p = sub.add_parser("list_clusters", help="[2.0] 列出用户分群列表")
    add_evtapi_common(p)

    # cluster_save
    p = sub.add_parser("cluster_save", help="[2.0] 新增用户分群")
    add_evtapi_common(p)
    p.add_argument("--cluster-name", required=True, help="分群名称（内部唯一标识）")
    p.add_argument(
        "--refresh-type", required=True, type=int, choices=[0, 1, 2], help="刷新类型: 0=自动, 1=手动, 2=不更新"
    )
    p.add_argument("--display-name", help="显示名称 (可选)")
    p.add_argument("--remarks", help="备注 (可选)")
    p.add_argument("--subject", default="user", choices=["user", "device"], help="主体: user(默认) / device")
    p.add_argument(
        "--qp", help="分群规则 JSON：可传前端 restore 结构，或完整 {userClusterDef,userClusterDefRestore} (可选)"
    )
    p.add_argument("--file-path", help="文件上传路径，用于文件分群 (可选)")
    p.add_argument("--timezone", help="时区 (可选)")

    # cluster_edit
    p = sub.add_parser("cluster_edit", help="[2.0] 编辑用户分群")
    add_evtapi_common(p)
    p.add_argument("--cluster-id", required=True, type=int, help="分群ID (从 list_clusters 获取)")
    p.add_argument(
        "--refresh-type", required=True, type=int, choices=[0, 1, 2], help="刷新类型: 0=自动, 1=手动, 2=不更新"
    )
    p.add_argument("--display-name", help="显示名称 (可选)")
    p.add_argument("--remarks", help="备注 (可选)")
    p.add_argument("--subject", choices=["user", "device"], help="主体: user / device (可选)")
    p.add_argument(
        "--qp", help="分群规则 JSON：可传前端 restore 结构，或完整 {userClusterDef,userClusterDefRestore} (可选)"
    )
    p.add_argument("--file-path", help="文件上传路径 (可选)")

    # list_tags
    p = sub.add_parser("list_tags", help="[2.0] 列出用户标签列表")
    add_evtapi_common(p)
    p.add_argument("-k", "--keyword", help="按 clusterName/displayName/remarks 关键字过滤 (可选)")
    p.add_argument(
        "--tag-type", choices=["sql", "condition", "file", "first_last", "quotation"], help="按标签类型过滤 (可选)"
    )
    p.add_argument("--subject", choices=["user", "device"], help="按主体过滤: user/device (可选)")
    p.add_argument("--cluster-name", help="按内部唯一标识精确过滤 (可选)")

    # tag_info
    p = sub.add_parser("tag_info", help="[2.0] 查询用户标签详情")
    add_evtapi_common(p)
    p.add_argument("--cluster-id", required=True, type=int, help="标签ID (从 list_tags 获取)")

    # tag_save
    p = sub.add_parser("tag_save", help="[2.0] 新增用户标签")
    add_evtapi_common(p)
    p.add_argument(
        "--tag-type",
        required=True,
        choices=["sql", "condition", "file", "first_last", "quotation"],
        help="标签类型: sql/condition/file/first_last/quotation",
    )
    p.add_argument("--cluster-name", required=True, help="标签名称（内部唯一标识）")
    p.add_argument(
        "--refresh-type",
        required=True,
        type=int,
        choices=[0, 1, 2, 3],
        help="刷新类型: 0=自动, 1=手动, 2=不更新, 3=定时自动(SQL标签)",
    )
    p.add_argument("--display-name", help="显示名称 (可选)")
    p.add_argument("--remarks", help="备注 (可选)")
    p.add_argument("--subject", default="user", choices=["user", "device"], help="主体: user(默认) / device")
    p.add_argument("--qp", help="标签规则定义 JSON；支持普通 JSON、URL 编码 JSON、从 curl 复制的 qp 值 (可选)")
    p.add_argument("--file-path", help="文件上传路径，用于文件标签 (可选)")

    # tag_edit
    p = sub.add_parser("tag_edit", help="[2.0] 编辑用户标签（未传 qp 时自动复用现有规则）")
    add_evtapi_common(p)
    p.add_argument("--cluster-id", required=True, type=int, help="标签ID (从 list_tags 获取)")
    p.add_argument(
        "--tag-type",
        choices=["sql", "condition", "file", "first_last", "quotation"],
        help="标签类型，仅用于校验/规范化 --qp (可选)",
    )
    p.add_argument("--display-name", help="显示名称 (可选)")
    p.add_argument(
        "--refresh-type",
        type=int,
        choices=[0, 1, 2, 3],
        help="刷新类型: 0=自动, 1=手动, 2=不更新, 3=定时自动(SQL标签) (可选)",
    )
    p.add_argument("--remarks", help="备注 (可选)")
    p.add_argument(
        "--qp",
        help=(
            "完整标签规则 JSON；支持普通 JSON、URL 编码 JSON、从 curl 复制的 qp 值。"
            "未传时先调用 tag_info 并原样复用现有规则。"
        ),
    )
    p.add_argument("--file-path", help="文件上传路径 (可选)")

    # folder_list
    p = sub.add_parser("folder_list", help="[2.0] 获取看板文件夹列表")
    add_evtapi_common(p)

    # folder_save
    p = sub.add_parser("folder_save", help="[2.0] 新建文件夹")
    add_evtapi_common(p)
    p.add_argument("--folder-name", required=True, help="文件夹名称")
    p.add_argument("--folder-type", default="normal_folder", help="文件夹类型 (默认 normal_folder)")

    # dashboard_save
    p = sub.add_parser("dashboard_save", help="[2.0] 新建看板")
    add_evtapi_common(p)
    p.add_argument("--dashboard-name", required=True, help="看板名称")
    p.add_argument(
        "--folder-id", required=True, type=int, help="目标文件夹ID (从 folder_list 获取 dashboardFolderId)"
    )
    p.add_argument("--order-string", default="[]", help="排序JSON数组 (默认 [], 新看板插入到文件夹最前面)")

    # dashboard_share_detail
    p = sub.add_parser("dashboard_share_detail", help="[2.0] 查看看板分享配置详情")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")

    # dashboard_save_share
    p = sub.add_parser("dashboard_save_share", help="[2.0] 保存并回读验证看板分享设置")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")
    read_scope = p.add_mutually_exclusive_group(required=True)
    read_scope.add_argument("--read-user-ids", help="可读用户ID列表（逗号分隔）")
    read_scope.add_argument("--share-all", action="store_true", help="显式授权：分享给项目内所有人")
    edit_scope = p.add_mutually_exclusive_group()
    edit_scope.add_argument(
        "--edit-user-ids",
        help="可编辑用户ID列表（逗号分隔；未传则保留现有编辑权限）",
    )
    edit_scope.add_argument(
        "--clear-edit-users",
        action="store_true",
        help="显式清空所有其他用户的编辑权限",
    )

    # report_save
    p = sub.add_parser("report_save", help="[2.0] 创建报表", description=REPORT_QP_RULES)
    add_evtapi_common(p)
    p.add_argument("--report-name", required=True, help="报表名称 (1-64字符)")
    p.add_argument(
        "--report-model",
        default="event",
        choices=["event", "retention", "funnel", "distribution", "property_analysis", "behavior_path"],
        help="报表模型 (默认 event)",
    )
    p.add_argument("--qp", required=True, help=REPORT_QP_HELP)
    p.add_argument("--report-desc", help="报表描述 (可选, 最长255字符)")
    p.add_argument("--rebuild-report-restore", action="store_true", help="即使传入 reportRestore 也按 qp 重新生成")
    p.add_argument(
        "--skip-metadata-validation",
        action="store_true",
        help="仅跳过 /event/quotas 与 /event/properties 校验；不会跳过事件身份三元组校验",
    )

    # report_edit
    p = sub.add_parser("report_edit", help="[2.0] 编辑报表并默认重建 reportRestore")
    add_evtapi_common(p)
    p.add_argument("--report-id", required=True, type=int, help="报表ID")
    p.add_argument("--report-name", help="报表名称 (可选)")
    p.add_argument(
        "--report-model",
        default="event",
        choices=["event", "retention", "funnel", "distribution", "property_analysis", "behavior_path"],
        help="报表模型 (默认 event)",
    )
    p.add_argument("--qp", required=True, help=REPORT_QP_HELP)
    p.add_argument("--report-desc", help="报表描述 (可选, 最长255字符)")
    p.add_argument("--preserve-report-restore", action="store_true", help="保留传入 qp 里的 reportRestore，不重建")
    p.add_argument(
        "--skip-metadata-validation",
        action="store_true",
        help="仅跳过 /event/quotas 与 /event/properties 校验；不会跳过事件身份三元组校验",
    )

    # report_list
    p = sub.add_parser("report_list", help="[2.0] 列出报表列表")
    add_evtapi_common(p)
    p.add_argument("--report-name", help="按名称过滤 (可选)")
    p.add_argument("--report-model", help="按模型过滤: event/retention/funnel/distribution 等 (可选)")

    # dashboard_add_reports
    p = sub.add_parser("dashboard_add_reports", help="[2.0] 往看板添加/更新报表列表 (含网格布局)")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")
    p.add_argument("--order-string", required=True, help="报表ID列表 JSON数组, 如 [101,102,103]")
    p.add_argument(
        "--coordinate",
        help=('网格布局 JSON, 12列网格系统, 如 {"101":{"x":0,"y":0,"w":6,"h":8},"102":{"x":6,"y":0,"w":6,"h":8}}'),
    )

    # dashboard_report_setting
    p = sub.add_parser("dashboard_report_setting", help="[2.0] 配置报表在看板中的显示设置")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")
    p.add_argument("--report-id", required=True, type=int, help="报表ID")
    p.add_argument(
        "--report-view-info",
        required=True,
        help="显示设置 JSON (含 visualChartType/visualModuleType/timeParticleSize 等)",
    )
    p.add_argument("--report-name", required=True, help="报表在看板中的显示名称")
    p.add_argument("--report-desc", help="报表描述 (可选)")

    # dashboard_detail
    p = sub.add_parser("dashboard_detail", help="[2.0] 获取看板详情及报表列表")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")

    # report_detail
    p = sub.add_parser("report_detail", help="[2.0] 获取报表查询配置 (events + eventView)")
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")
    p.add_argument("--report-id", required=True, type=int, help="报表ID")

    # dashboard_analysis
    p = sub.add_parser("dashboard_analysis", help="[2.0] 执行看板报表查询", description=REPORT_QP_RULES)
    add_evtapi_common(p)
    p.add_argument("-d", "--dashboard-id", required=True, type=int, help="看板ID")
    p.add_argument("--report-id", required=True, type=int, help="报表ID")
    p.add_argument("--qp", required=True, help=ANALYSIS_QP_HELP)
    p.add_argument("--no-cache", action="store_true", help="不使用缓存")

    # event_analysis
    p = sub.add_parser("event_analysis", help="[2.0] 执行独立事件分析查询", description=REPORT_QP_RULES)
    add_evtapi_common(p)
    p.add_argument(
        "--event-model",
        default="event",
        choices=[
            "event",
            "retention",
            "funnel",
            "distribution",
            "property_analysis",
            "behavior_path",
            "user_search",
            "user_cluster",
            "user_tag",
            "user_list",
            "user_seq",
            "virtual_event",
        ],
        help="分析模型 (默认 event)",
    )
    p.add_argument("--qp", required=True, help=ANALYSIS_QP_HELP)
    p.add_argument("--no-cache", action="store_true", help="不使用缓存")

    visible_command_names = [name for name in command_parsers if not command_hidden.get(name)]
    sub.metavar = "{" + ",".join(visible_command_names) + "}"

    # ── 预扫描 argv，将 region 别名规范化 ──
    # 防止 LLM 传入 domestic/overseas 等 argparse 不识别的值导致 exit(2)
    _normalize_region_in_argv()

    args = parser.parse_args()
    args._command_parsers = command_parsers
    args._command_helps = command_helps
    args._command_hidden = command_hidden

    # ── 校验 project_id 必须是数字 ──
    # -p 接收的是项目数字 ID，不是项目名。LLM 常把项目名(如「小镇」)直接塞进 -p，
    # v1 命令会因 int() 抛 ValueError，TapDB 2.0 evtapi 命令则会把名字原样发给服务端换回
    # 一个看不懂的 500「出事了」，进而陷入重试。这里在发请求前统一拦截并给出可读提示。
    project_id = getattr(args, "project_id", None)
    if project_id is not None and not str(project_id).strip().isdigit():
        output(
            {
                "error": True,
                "message": (
                    f"-p/--project-id 必须是项目数字 ID，而不是项目名「{project_id}」。"
                    "请先用 `list_projects` 按名称/备注/标签匹配出对应的 project_id（数字），再用该 ID 重试。"
                ),
            }
        )
        sys.exit(1)

    validate_group_by(args.command, getattr(args, "group_by", None))
    verify_project_access_or_exit(args)

    cmd_map = {
        "list_projects": cmd_list_projects,
        "download_skills": cmd_download_skills,
        "download_common_skills": cmd_download_common_skills,
        "skills_last_modified": cmd_skills_last_modified,
        "common_skills_last_modified": cmd_common_skills_last_modified,
        "sync_skills": cmd_sync_skills,
        "sync_common_skills": cmd_sync_common_skills,
        "season_info": cmd_season_info,
        "describe": cmd_describe,
        "mani_events": cmd_mani_events,
        "active": cmd_active,
        "op_overview": cmd_op_overview,
        "bury_point_overview": cmd_bury_point_overview,
        "bury_point_error_detail": cmd_bury_point_error_detail,
        "bury_point_real_time_status": cmd_bury_point_real_time_status,
        "bury_point_real_time_detail": cmd_bury_point_real_time_detail,
        "bury_point_real_time_switch": cmd_bury_point_real_time_switch,
        "retention": cmd_retention,
        "income": cmd_income,
        "source": cmd_source,
        "player_behavior": cmd_player_behavior,
        "version_distri": cmd_version_distri,
        "user_value": cmd_user_value,
        "whale_user": cmd_whale_user,
        "life_cycle": cmd_life_cycle,
        "cost": cmd_cost,
        "ad_data": cmd_ad_data,
        "ad_monet": cmd_ad_monet,
        "raw": cmd_raw,
        # TapDB 2.0
        "list_events": cmd_list_events,
        "list_props": cmd_list_props,
        "event_save": cmd_event_save,
        "event_edit": cmd_event_edit,
        "property_save": cmd_property_save,
        "property_edit": cmd_property_edit,
        "event_quotas": cmd_event_quotas,
        "event_properties": cmd_event_properties,
        "virtual_property_save": cmd_virtual_property_save,
        "list_clusters": cmd_list_clusters,
        "cluster_save": cmd_cluster_save,
        "cluster_edit": cmd_cluster_edit,
        "list_tags": cmd_list_tags,
        "tag_info": cmd_tag_info,
        "tag_save": cmd_tag_save,
        "tag_edit": cmd_tag_edit,
        "folder_list": cmd_folder_list,
        "folder_save": cmd_folder_save,
        "dashboard_save": cmd_dashboard_save,
        "report_save": cmd_report_save,
        "report_edit": cmd_report_edit,
        "report_list": cmd_report_list,
        "dashboard_add_reports": cmd_dashboard_add_reports,
        "dashboard_report_setting": cmd_dashboard_report_setting,
        "dashboard_detail": cmd_dashboard_detail,
        "dashboard_share_detail": cmd_dashboard_share_detail,
        "dashboard_save_share": cmd_dashboard_save_share,
        "report_detail": cmd_report_detail,
        "dashboard_analysis": cmd_dashboard_analysis,
        "event_analysis": cmd_event_analysis,
    }
    cmd_map[args.command](args)
