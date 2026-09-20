# TapDB CLI 使用指南

本文只覆盖指标 API、TapDB 2.0 事件分析、分群、标签、虚拟属性、报表和看板能力；不提供任意 SQL 查询。

## 环境要求

- Python 3
- 国内密钥：`TAPDB_MCP_KEY_CN`
- 海外密钥：`TAPDB_MCP_KEY_SG`
- 认证统一使用对应区域的 MCP Key；无需额外配置 TapDB user ID。

统一入口：

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py <command> [args]
```

## 区域与项目访问

- 国内使用 `-r cn`，海外使用 `-r sg`；区域一旦确认，本轮所有命令必须保持一致。
- 不确定区域时，依次查询 `list_projects -r cn` 和 `list_projects -r sg`。
- 所有带 `-p/--project-id` 的命令都会先校验项目访问权限。项目不在同区域项目列表中时，命令返回 `project_not_accessible` 并停止。
- `-p` 必须传数字项目 ID，不能传项目名称。

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py list_projects -r cn
python3 <SKILL_DIR>/scripts/tapdb_query.py list_projects -r sg --search 海外项目名
python3 <SKILL_DIR>/scripts/tapdb_query.py describe
python3 <SKILL_DIR>/scripts/tapdb_query.py describe report_save
```

### 按完整项目名定位项目

用户提供完整项目名时，Skill 自动添加 `--watch-project-name` 发现项目；用户无需了解或主动提供该内部查询参数。

```bash
# 项目名必须完整；服务端仅在未删除、未归档项目中做精确匹配，且必须唯一命中
python3 <SKILL_DIR>/scripts/tapdb_query.py list_projects -r cn \
  --watch-project-name "项目完整名称" --search "项目完整名称"

# 从上一步返回的 project_id 继续查询时，必须带同一个参数，以便项目访问守卫使用同一份服务端项目列表
python3 <SKILL_DIR>/scripts/tapdb_query.py v2_list_events -r cn -p <PROJECT_ID> \
  --watch-project-name "项目完整名称"
```

- `--watch-project-name` 将完整项目名透传给项目访问服务，仅在名称唯一命中时追加对应项目。
- 名称未命中或命中多个项目时不会追加，也不会绕过项目访问校验。
- 后续带 `-p` 的项目命令必须继续携带同一个 `--watch-project-name`，以便访问校验使用相同的项目上下文。
- 只有用户仅提供 ID、没有名称时才使用 `--watch-project-id <PROJECT_ID>`，将已知项目 ID 透传给项目访问服务并受控追加对应项目；两个参数同时传入时，ID 优先。

## 通用参数

| 参数 | 说明 |
|---|---|
| `-p, --project-id` | 数字项目 ID |
| `-s, --start` | 开始日期 `YYYY-MM-DD` |
| `-e, --end` | 结束日期 `YYYY-MM-DD` |
| `-g, --group-by` | 分组字段；先用 `describe <command>` 确认 |
| `--group-unit` | `hour/day/week/month`，但部分接口只支持 day |
| `--filters` | JSON 数组格式过滤条件 |
| `--limit` | 返回行数上限 |
| `--de-water` | 去水；默认不去水 |
| `--exchange-to-currency` | 金额币种，默认 CNY；传 `none` 禁用转换 |
| `-r, --region` | `cn` 或 `sg` |
| `--no-truncate` | 输出完整结果，不截断长数据 |
| `--watch-project-name` | 按完整项目名受控追加唯一命中的项目；后续 `-p` 命令需重复传入 |
| `--watch-project-id` | 按已知项目 ID 受控追加对应项目；优先于名称参数 |

`-r` 和 `--no-truncate` 可以放在子命令前或后。

## 指标查询

```bash
# 活跃，可一次查询多个 quota
python3 <SKILL_DIR>/scripts/tapdb_query.py active -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  --quota dau wau mau -g time --group-unit day

# 运营概览缓存
python3 <SKILL_DIR>/scripts/tapdb_query.py op_overview -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  --quota active --interval day

# 留存、来源、LTV 和生命周期只使用 day 粒度
python3 <SKILL_DIR>/scripts/tapdb_query.py retention -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  --subject user -g activation_time --group-unit day
python3 <SKILL_DIR>/scripts/tapdb_query.py source -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  -g activation_time --group-unit day

# 收入时间字段是 time
python3 <SKILL_DIR>/scripts/tapdb_query.py income -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  -g time --group-unit week

# 买量成本时间字段是 dt
python3 <SKILL_DIR>/scripts/tapdb_query.py cost -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 -g dt

# 广告投放使用独立的逗号分隔 quotas
python3 <SKILL_DIR>/scripts/tapdb_query.py ad_data -p <PROJECT_ID> -s 2026-07-01 -e 2026-07-07 \
  --quotas cost,display,activation -g time --limit 100
```

时间与分组硬规则：

- `active`、`income`、`player_behavior` 使用 `time`。
- `retention`、`source`、`user_value`、`life_cycle` 使用 `activation_time`，且只支持 day。
- `retention` 输出的 `_query_context` 会明确标注 `subject` 及历史 `newDevice/*_newDevice` 字段的账号/设备语义。
- `cost` 使用 `dt`；`ad_data` 固定 day。
- 单次连续时间范围不超过 180 天。
- 不确定分组、指标或过滤字段时先运行 `describe <command>`，不要猜参数。

## 埋点接收/入库质量排查

```bash
# 埋点概览；纯日期会自动补成 00:00:00 ~ 23:59:59
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_overview \
  -p <PROJECT_ID> -s 2026-07-28 -e 2026-08-03

# 指定事件的错误字段与错误码明细；eventName 优先取自上一步概览
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_error_detail \
  -p <PROJECT_ID> -s '2026-07-28 00:00:00' -e '2026-08-03 23:59:59' \
  --event-name <EVENT_NAME>

# 查询实时埋点监测开关状态，只读，不修改状态
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_real_time_status -p <PROJECT_ID>

# 开启实时上报明细；命令成功后默认等待 10 秒再返回
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_real_time_switch \
  -p <PROJECT_ID> --status on

# 查询实时上报明细；每次开启最长 1 小时后自动关闭
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_real_time_detail -p <PROJECT_ID>

# 主动关闭实时上报明细
python3 <SKILL_DIR>/scripts/tapdb_query.py bury_point_real_time_switch \
  -p <PROJECT_ID> --status off
```

- `bury_point_overview` 返回事件级以及全项目汇总的接收、入库、入库异常、入库失败数量。
- 时间参数接受 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:MM:SS`，不接受带时区偏移的时间。
- 概览和错误明细应使用同一时间窗；错误明细只针对一个事件，事件名应使用概览返回的原始 `eventName`。
- 排查顺序是先看概览，再按需查询错误明细；实时监测状态使用只读命令查询。
- 查询实时上报明细前必须先用 `bury_point_real_time_switch --status on` 开启，等待系统生效后再查询；每次开启最长 1 小时后自动关闭，也可主动传 `--status off` 关闭。

## 项目知识与运营边界

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py season_info -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py mani_events -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py sync_skills -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py skills_last_modified -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py download_skills -p <PROJECT_ID> -o skills_<PROJECT_ID>.zip
```

涉及版本、赛季、活动或卡池时，优先使用 `season_info`、`mani_events` 和 `sync_skills` 确定真实时间边界。

## TapDB 2.0 元数据与事件分析

```bash
# 事件、属性与合法指标
python3 <SKILL_DIR>/scripts/tapdb_query.py list_events -p <PROJECT_ID> --flat
python3 <SKILL_DIR>/scripts/tapdb_query.py list_events -p <PROJECT_ID> -k gacha -k 抽卡 --min-recent 1
python3 <SKILL_DIR>/scripts/tapdb_query.py list_props -p <PROJECT_ID> --table-type 0
python3 <SKILL_DIR>/scripts/tapdb_query.py event_quotas -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py event_properties -p <PROJECT_ID> --event-ids <EVENT_ID_1>,<EVENT_ID_2>

# 独立事件分析
python3 <SKILL_DIR>/scripts/tapdb_query.py event_analysis -p <PROJECT_ID> \
  --qp '{"events":[...],"eventView":{...}}'
```

## TapDB 2.0 物理事件与属性维护

物理埋点元数据写操作必须使用正式命令，不要使用 `raw`。事件名，以及物理属性的名称、类型、主体创建后不可通过编辑命令修改。编辑命令会先读取详情，未传字段保持原值。

| 场景 | 命令 | 关键参数 |
|---|---|---|
| 新增物理事件 | `event_save` | `-p --event-name --display-name [--prop-ids]` |
| 修改物理事件 | `event_edit` | `-p --event-id`，可选显示名、状态、开关、说明、完整属性列表 |
| 新增物理属性 | `property_save` | `-p --table-type --column-name --display-name --column-type --select-type` |
| 修改物理属性 | `property_edit` | `-p --prop-id`，可选显示名、单位、状态、开关、说明 |

```bash
# 新增事件属性
python3 <SKILL_DIR>/scripts/tapdb_query.py property_save -p <PROJECT_ID> -r cn \
  --table-type 0 --column-name item_id --display-name "道具 ID" \
  --column-type varchar --select-type string

# 新增事件并关联 list_props -t 0 返回的真实 propId
python3 <SKILL_DIR>/scripts/tapdb_query.py event_save -p <PROJECT_ID> -r cn \
  --event-name item_use --display-name "使用道具" --prop-ids 101,102

# 修改时省略未改字段；事件属性关联也会保留
python3 <SKILL_DIR>/scripts/tapdb_query.py event_edit -p <PROJECT_ID> -r cn \
  --event-id <EVENT_ID> --display-name "消耗道具"

python3 <SKILL_DIR>/scripts/tapdb_query.py property_edit -p <PROJECT_ID> -r cn \
  --prop-id <PROP_ID> --display-name "道具标识"
```

新增事件的 `--prop-ids` 和修改事件的属性完整列表都必须来自当前项目 `list_props -t 0`。新增属性的类型组合会根据服务端 `meta/getSelectAndColumnTypeMap` 动态校验。完整规则见 `physical_metadata_guide.md`。

事件 ID、事件名、事件描述、属性名和分析指标必须来自上述真实元数据。把 `eventId` + `eventName` + `eventDesc` 作为同一条事件记录的原子身份；`eventNameDisplay` 不能替代 `eventDesc`。报表写命令会重新读取事件目录、补齐并校验三元组，随后同步所有 `reportRestore` 事件引用；缺描述或 ID/名称冲突时硬停止。事件模型的 `--qp` 包含 `events` 与 `eventView`；时间分组中的 `timeTypeColumnFormat` 必须与 `timeParticleSize` 一致。

## 报表与看板

推荐顺序：

1. `folder_list` 确认文件夹与既有看板。
2. 必要时用 `folder_save`、`dashboard_save` 创建容器。
3. 用元数据构建 qp，调用 `report_save` 创建报表。
4. 用 `dashboard_add_reports` 加入看板并设置网格布局。
5. 用 `report_detail` 回读，确认 `events[].eventDesc`、`reportRestore.data.dimensions.global.eventDesc`、`reportRestore.selected.correctCustom[].data.event.eventDesc` 均非空。
6. 用 `dashboard_report_setting` 保存展示配置。
7. 用 `dashboard_analysis` 验证最终 qp；`success` 不能替代上一步的恢复结构检查。
8. 只有用户明确要求分享时，才用 `dashboard_save_share` 显式传入分享范围。

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py folder_list -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py folder_save -p <PROJECT_ID> --folder-name AI看板
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_save -p <PROJECT_ID> \
  --dashboard-name 运营总览 --folder-id <FOLDER_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py report_save -p <PROJECT_ID> \
  --report-name DAU趋势 --qp '{"events":[...],"eventView":{...}}'
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_add_reports -p <PROJECT_ID> -d <DASHBOARD_ID> \
  --order-string '[<REPORT_ID>]' --coordinate '{"<REPORT_ID>":{"x":0,"y":0,"w":12,"h":8}}'
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_report_setting -p <PROJECT_ID> -d <DASHBOARD_ID> \
  --report-id <REPORT_ID> --report-name DAU趋势 \
  --report-view-info '{"visualChartType":"line","timeParticleSize":"day"}'
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_analysis -p <PROJECT_ID> -d <DASHBOARD_ID> \
  --report-id <REPORT_ID> --qp '{"events":[...],"eventView":{...}}'
# 分享给特定用户；未传编辑权限时保留现有值
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_save_share -p <PROJECT_ID> -d <DASHBOARD_ID> \
  --read-user-ids '<USER_ID_1>,<USER_ID_2>'

# 只有用户明确授权全员分享时使用
python3 <SKILL_DIR>/scripts/tapdb_query.py dashboard_save_share -p <PROJECT_ID> -d <DASHBOARD_ID> --share-all
```

编辑已有看板前先查看 `dashboard_detail`、`report_list` 和 `report_detail`。详细参数结构见 `report_api.md` 和 `dashboard_guide.md`。

## 虚拟属性

虚拟属性不是任意 SQL 查询。`--sql` 仅接受一个计算表达式，命令会先调用 2.0 的 `sqlInspect` 校验，再创建属性。

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py virtual_property_save -p <PROJECT_ID> \
  --table-type 0 --column-name amount_yuan --display-name '金额（元）' \
  --column-type double --select-type number --sql 'amount / 100.0' --dry-run
```

创建前必须阅读 `virtual_property_guide.md` 并先执行 `--dry-run`。

## 用户分群与标签

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py list_clusters -p <PROJECT_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py cluster_save -p <PROJECT_ID> \
  --cluster-name active_7d --refresh-type 0 --qp '{...}'
python3 <SKILL_DIR>/scripts/tapdb_query.py cluster_edit -p <PROJECT_ID> \
  --cluster-id <CLUSTER_ID> --refresh-type 0 --qp '{...}'

python3 <SKILL_DIR>/scripts/tapdb_query.py list_tags -p <PROJECT_ID> --subject user
python3 <SKILL_DIR>/scripts/tapdb_query.py tag_info -p <PROJECT_ID> --cluster-id <CLUSTER_ID>
python3 <SKILL_DIR>/scripts/tapdb_query.py tag_save -p <PROJECT_ID> \
  --tag-type condition --cluster-name high_value --refresh-type 0 --qp '{...}'
python3 <SKILL_DIR>/scripts/tapdb_query.py tag_edit -p <PROJECT_ID> \
  --cluster-id <CLUSTER_ID> --display-name '高价值用户' --refresh-type 0
```

创建或重写规则前必须阅读 `cluster_guide.md`，并从 `list_events`、`list_props` 或已有配置中取得真实字段。`tag_edit` 未传 `--qp` 时会先读取标签详情并复用现有规则；读取或解析失败时不会发送编辑请求。

## 数据量与错误处理

- 先查汇总或 Top10，再按需下钻；不要一开始拉取大范围逐日明细。
- TapDB API 调用必须串行，避免触发并发限制。
- HTTP 429 由脚本指数退避重试；最终仍失败时保留已成功结果并披露限流。
- 时间分组响应中的全期汇总行会拆到顶层 `summary`，避免与每日明细重复求和。
- 写操作只有在用户明确要求创建、编辑、配置或分享时才执行。
