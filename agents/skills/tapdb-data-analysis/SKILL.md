---
name: tapdb-data-analysis
description: >
  当用户询问 TapDB 或基于 TapDB 的游戏数据查询、分析、导出、看板或报表时使用。
  适用于游戏运营指标和自然语言请求，包括 TapDB、游戏数据、项目、project_id/app_id、
  DAU/WAU/MAU、活跃、新增、留存、收入、付费、ARPU/ARPPU、LTV、广告变现/monet、
  买量、投放、ROI/ROAS/CPI、渠道、版本、赛季、活动、卡池/gacha、用户分群、标签、
  趋势、异常、对比、看板和报表。也适用于自定义事件查询与分析、事件属性、
  TapDB 2.0 events/props 元数据、虚拟属性创建/计算属性、cohort/人群分析，
  埋点接收/入库质量概览、埋点错误明细、实时埋点监测状态、实时上报明细，以及任何需要 TapDB CLI、TapDB 看板
  或 TapDB 报表能力的问题。也适用于埋点接入：埋点、埋点指引、预置事件、
  接入 SDK 上报、上报事件、事件埋点、tracking、instrumentation，
  以及需要设计或补充 TapDB 埋点、核查已有埋点、诊断后台无数据问题或查询埋点规则的请求。
---

# TapDB Data Analysis

> Skill 版本：v0.5.1

所有命令统一使用 `python3 <SKILL_DIR>/scripts/tapdb_query.py <args>`；无需额外安装或 bootstrap。

## 执行优先级

- 先判定场景：纯数据查询只查数并简短说明；深度分析才进入分阶段下钻和正式报告；看板创建/编辑只在用户明确要求写操作时执行。
- 埋点设计、代码接入、已有埋点核查、无数据诊断及验收统一读取 `references/tracking_guide.md`，并按其中的任务分类、完整流程、事实来源和授权边界执行。新增或补充埋点时，按指引执行 `sync_common_skills -r <region>` 并读取本次同步的通用知识库；仅在用户明确提出修复或补充需求时，方可执行代码或元数据写入操作。
- “确认项目/时间/指标”优先理解为从用户文本、`list_projects`、`season_info`、`mani_events`、`sync_skills`、TapDB 2.0 元数据中核实；信息足够时直接查询，不要先反问。
- 边界预查询可先于最终指标查询执行：`list_projects`、`season_info`、`mani_events`、`sync_skills`、`list_events`、`list_props`、`folder_list` 可用于确认项目、区域、版本、活动、报表和字段，不要求先有完整指标时间窗。
- 区域未知时，先顺序执行 `list_projects -r cn` 与 `list_projects -r sg` 做发现；一旦项目在某一区域列表中命中，锁定该区域并给后续所有 TapDB 命令显式带同一个 `-r`。若用户已明确区域或项目已从某一区域列表确认，后续 `project_not_accessible` 就停止后续查询，不要盲目切另一区域重试同一个 ID。
- 访问校验优先于项目命令：项目未出现在同一区域 `list_projects` 返回列表时，不执行指标、TapDB 2.0、看板、`sync_skills` 或 raw 查询；回到项目列表匹配或提示补权限。
- 按完整项目名定位项目时，首个项目查询使用 `list_projects -r <region> --watch-project-name "<完整项目名>" --search "<完整项目名>"`。服务端仅在完整名称唯一命中时追加对应项目；不得根据目录名、应用名或相似名称推断目标项目。
- 项目通过完整名称确认后，本轮后续每个带 `-p` 的项目命令均重复携带相同的 `--watch-project-name "<完整项目名>"`。用户提供数字项目 ID 时使用 `--watch-project-id <PROJECT_ID>`；名称未命中或不唯一时停止后续项目查询并向用户确认。
- 并发限制适用于所有 TapDB API 调用，不论通过 MCP 还是本地 `tapdb_query.py`；TapDB 命令必须串行。读取本地文档、代码或日志不属于 TapDB API 调用，可以并行。

## 区域选择规则

- 用户说 `SG`、`海外`、`海外体系`、`global`、`international`、`overseas`、`ap-sg`，或项目来自海外列表时，后续每一次 TapDB 命令都必须显式带 `-r sg`，例如 `income -r sg -p <PROJECT_ID> ...`。
- 用户说 `CN`、`国内`、`国内体系`、`china`、`domestic`，或项目来自国内列表时，后续每一次 TapDB 命令都必须显式带 `-r cn`。
- 一旦本轮对话确定了项目区域，`list_projects`、`sync_skills`、指标查询、TapDB 2.0/看板命令都要沿用同一个 `-r`；不要把海外 project_id 拿去调用默认国内 endpoint。
- 脚本未显式传 `-r` 时会读取 `TAPDB_REGION` / `TAPDB_MCP_REGION` 作为默认区域；如果这些环境变量也没有，默认是 `cn`。因此用户文本里出现 SG/海外信号时，仍然必须显式传 `-r sg`。
## 项目访问规则

- 任意带 `-p/--project-id` 的项目命令在真正查询前都会用同一区域的 `list_projects` 结果做可访问性校验；项目不在返回列表中时，脚本会返回 `project_not_accessible` 并停止，不会继续执行指标、TapDB 2.0、sync 或 raw 查询。
- 当已锁定区域的 `list_projects` 查不到用户确认的 project_id 时，结论是“当前 TapDB 账号不可访问该项目或区域不匹配”。不要继续用这个 ID 发后续查询，也不要只靠切换 `cn`/`sg` 重试同一个 ID；应回到 `list_projects` 按项目名、备注、标签重新确认可访问项目，或提示用户补权限。

## 命令速查

| 用户意图 / 场景 | 正确的命令 | 必选参数 | 说明 |
|---|---|---|---|
| 查项目列表 | `list_projects` | 无（`-r sg` 查海外） | |
| 查命令能力/参数 | `describe` | 可选 `<cmd>` | 不确定参数、quota、分组或 TapDB 2.0 子命令时先查；不要对猜测命令名调用 |
| 同步项目 Skills | `sync_skills` | `-p` | 项目确认后执行；沿用同一区域 `-r` |
| 同步通用知识库（埋点指南） | `sync_common_skills` | 无 | 设计或补充埋点方案前执行；命令将自动检查版本，并在存在更新时下载至 `.tapdb/skills/common/` |
| 查询通用知识库更新时间 | `common_skills_last_modified` | 无 | 用于版本检查及同步诊断 |
| 下载通用知识库 ZIP | `download_common_skills` | 无 | 用于离线查看、备份或分发知识库原始包 |
| 查 Skills 更新时间 | `skills_last_modified` | `-p` | 仅需确认远端更新时间时用 |
| 下载项目 Skills zip | `download_skills` | `-p` | 需要离线查看项目 Skills 包时用；通常优先 `sync_skills` |
| 查版本/赛季信息 | `season_info` | 可选 `-p` | 涉及版本、赛季、活动窗口时的边界预查询 |
| 查运营事件 | `mani_events` | `-p` | 涉及活动、联动、卡池时间线时用；不传时间默认查全部 |
| 查 DAU/WAU/MAU | `active` | `-p -s -e --quota` | `--quota dau wau mau`（多值空格分隔；默认 dau） |
| 查收入/付费 | `income` | `-p -s -e` | 时间字段用 `-g time`（不能用 activation_time） |
| 查留存 | `retention` | `-p -s -e` | 时间字段用 `-g activation_time`；仅 day 粒度；输出 `_query_context` 标注 user/device 口径（没有 --quota） |
| 查新增/来源 | `source` | `-p -s -e` | 时间字段用 `-g activation_time`；仅 day 粒度 |
| 查 LTV/用户价值 | `user_value` | `-p -s -e` | 时间字段用 `-g activation_time`；仅 day 粒度 |
| 查玩家行为 | `player_behavior` | `-p -s -e` | `--quota behavior`（时间序列）或 `--quota duration`（分布） |
| 查版本分布 | `version_distri` | `-p -s -e` | |
| 查鲸鱼用户 | `whale_user` | `-p -s -e` | 高付费用户排行 |
| 查生命周期 | `life_cycle` | `-p -s -e` | `--quota payment_amount` / `payment_cvs_rate`；仅 day 粒度 |
| 查广告变现/monet | `ad_monet` | `-p -s -e` | 用户说 monet/monetization 优先用这个，不要用 income |
| 查买量成本 | `cost` | `-p -s -e` | 时间字段用 `-g dt`（不能用 time） |
| 查买量投放(回退) | `ad_data` | `-p -s -e --quotas` | 独立参数 `--quotas cost,display`（逗号分隔） |
| 运营概览(缓存) | `op_overview` | `-p -s -e --quota --interval` | `--quota income\|active\|activation`；minute/hour 需 `--compared-date` |
| 查埋点概览 | `bury_point_overview` | `-p -s -e` | 返回事件及全项目的接收、入库、入库异常、入库失败数量；纯日期自动补全天边界 |
| 查埋点错误明细 | `bury_point_error_detail` | `-p -s -e --event-name` | 与概览使用同一时间窗；事件名优先使用概览返回的原始 `eventName` |
| 查埋点实时监测状态 | `bury_point_real_time_status` | `-p` | 只读查询，返回 `on` / `off`，不修改开关 |
| 开关实时上报明细 | `bury_point_real_time_switch` | `-p --status on\|off` | `on` 成功后默认等待 10 秒；每次开启最长 1 小时后自动关闭 |
| 查实时上报明细 | `bury_point_real_time_detail` | `-p` | 必须先通过 `bury_point_real_time_switch --status on` 开启，等待系统生效后查询 |
| **查看板列表** | `folder_list` | `-p` | 返回看板文件夹列表，看板嵌套在每个文件夹的 `dashboards` 数组内(含可点击 `url`)；没有 `dashboard_list` 或 `list_dashboards` 命令 |
| **新建看板文件夹** | `folder_save` | `-p --folder-name` | 写操作：用户明确要求创建/配置看板时可用；`--folder-type` 默认 `normal_folder` |
| **新建看板** | `dashboard_save` | `-p --dashboard-name --folder-id` | 写操作：先用 `folder_list` 确认目标 `dashboardFolderId`；返回 `dashboardId` |
| **创建报表** | `report_save` | `-p --report-name --qp` | 写操作：`--qp` 必须基于真实元数据构建；CLI 会原子校验/补齐 `eventId`、`eventName`、`eventDesc`，再生成 `reportRestore` |
| **编辑/修复报表** | `report_edit` | `-p --report-id --qp` | 写操作：默认重建 `reportRestore`；用于修复旧报表中属性聚合指标被写成属性的问题 |
| **添加/更新看板报表** | `dashboard_add_reports` | `-p -d DASHBOARD_ID --order-string` | 写操作：把报表加入看板；`--coordinate` 设置 12 列网格布局 |
| **配置看板报表展示** | `dashboard_report_setting` | `-p -d DASHBOARD_ID --report-id --report-view-info --report-name` | 写操作：设置图表类型、时间粒度、展示指标等；`reportViewInfo` 必须包含时间字段 |
| **查看板详情** | `dashboard_detail` | `-p -d DASHBOARD_ID` | 不要用不存在的 `dashboard` |
| **查看板分析** | `dashboard_analysis` | `-p -d DASHBOARD_ID --report-id REPORT_ID --qp QUERY_JSON` | 不要用不存在的 `dashboard` |
| **查看看板分享** | `dashboard_share_detail` | `-p -d DASHBOARD_ID` | 返回当前分享设置（readUserIds / editUserIds） |
| **分享看板给所有人** | `dashboard_save_share` | `-p -d DASHBOARD_ID --share-all` | 高影响写操作；只有用户明确要求全员分享时才使用 `--share-all` |
| **分享看板给特定用户** | `dashboard_save_share` | `-p -d <DASHBOARD_ID> --read-user-ids "<USER_ID_1>,<USER_ID_2>"` | 先调 `dashboard_share_detail` 查看当前配置并让用户确认 ID；未传编辑权限时 CLI 会保留现值 |
| **查报表列表** | `report_list` | `-p` | 不要用不存在的 `report` 或 `list_reports` |
| **查报表配置** | `report_detail` | `-p -d DASHBOARD_ID --report-id REPORT_ID` | 不要用不存在的 `report` 或 `report_info` |
| 查事件列表 | `list_events` | `-p` | 事件元数据的唯一入口 |
| 查属性字典 | `list_props` | `-p` | 属性元数据的唯一入口 |
| 新增物理事件 | `event_save` | `-p --event-name --display-name` | 写操作；`--prop-ids` 只能使用 `list_props -t 0` 返回的物理事件属性 ID |
| 修改物理事件 | `event_edit` | `-p --event-id` | 写操作；事件名不可改；省略字段会先回读详情并保留，`--prop-ids` 表示完整关联列表 |
| 新增物理属性 | `property_save` | `-p --table-type --column-name --display-name --column-type --select-type` | 写操作；主体 `0/1/2=事件/账号/设备`，类型组合先由服务端元数据校验 |
| 修改物理属性 | `property_edit` | `-p --prop-id` | 写操作；名称、类型、主体不可改；仅支持显示名、单位、状态、接收开关、说明 |
| 查事件分析指标 | `event_quotas` | `-p` | 返回 `/event/quotas`，用于确认 `analysis` 合法值 |
| 查指定事件属性 | `event_properties` | `-p --event-ids` 或 `--event-names` | 返回 `/event/properties`，用于确认属性 `quota` 是否属于该事件 |
| 新建计算虚拟属性 | `virtual_property_save` | `-p --table-type --column-name --display-name --column-type --select-type --sql` | 写操作；自动规范化 `#vp@`、执行 `sqlInspect`，通过后调用 `virtualMeta/addMetaProp`；`--dry-run` 只校验 |
| 执行独立事件分析 | `event_analysis` | `-p --qp` | 创建/验证报表外的 event qp 查询 |
| 查分群列表 | `list_clusters` | `-p` | |
| 新增用户分群 | `cluster_save` | `-p --cluster-name --refresh-type --qp` | 写操作；创建/编辑前读 `references/cluster_guide.md` |
| 编辑用户分群 | `cluster_edit` | `-p --cluster-id --refresh-type --qp` | 写操作；参数来自真实元数据/已有分群配置 |
| 查标签列表 | `list_tags` | `-p` | |
| 查标签详情 | `tag_info` | `-p --cluster-id` | |
| 新增用户标签 | `tag_save` | `-p --tag-type --cluster-name --refresh-type --qp` | 写操作；事件/属性字段必须来自元数据 |
| 编辑用户标签 | `tag_edit` | `-p --cluster-id` | 写操作；`--qp` 可选，未传时 CLI 先查 `tag_info` 并复用现有规则；无法复用则不发写请求 |
| ad_data 行数上限 | `ad_data` | `--limit` 可选 | 兼容返回行数上限；仍须用 `--quotas cost,display` 逗号分隔 |

> **命令名称约束**：仅使用本表或 `describe` 返回的命令，不要调用 `natural_language_role_data_query` 等自然语言伪命令。

> **禁止使用的命令名**（LLM 常编造的错误名）：`dashboard`、`report`、`list_dashboards`、`dashboard_list`、`dashboard_report`、`list_dashboard_reports`、`report_info`、`report_del`、`dashboard_share`、`dashboard_auth_save`、`save_dashboard_share` —— 这些**不存在**，会返回「未知接口」错误！不要缩写或猜测命令名。
>
> **看板创建能力已内置**：`folder_save` / `dashboard_save` / `report_save` / `dashboard_add_reports` / `dashboard_report_setting`。用户明确要求新建/配置看板时必须按可写能力处理，不要因为默认只读习惯拒绝；但必须先确认项目、文件夹、报表口径/模板，并使用真实元数据构建参数。
>
> **看板分享能力已内置**：创建/配置看板不代表授权分享，不得自动执行分享。只有用户明确要求分享时，先调 `dashboard_share_detail -p <id> -d <dashboardId>` 查看现状并确认范围；特定人员使用 `--read-user-ids "id1,id2"`，全员分享必须显式使用 `--share-all`。命令会在写后回读验证，未传 `--edit-user-ids` 时保留现有编辑权限；只有明确要求清空时才使用 `--clear-edit-users`。
>
> **物理事件/属性维护能力已内置**：用户明确要求新增或修改埋点元数据时，使用 `event_save`、`event_edit`、`property_save`、`property_edit`，不要用 `raw` 直调。新增事件关联属性前先用 `list_props -t 0` 获取 `propId`；编辑命令省略字段时会回读详情保留原值，避免部分更新误清空。事件名以及物理属性的名称、类型、主体不可修改；如用户要求改这些不可变字段，停止并说明应新建元数据后迁移。
>
> **虚拟属性创建能力已内置**：用户明确要求创建虚拟属性时使用 `virtual_property_save`，不要使用 `raw` 或直接写元数据库。创建前读取 `references/virtual_property_guide.md`；命令会先执行 SQL 校验，指定事件时会从真实事件元数据解析 `--event-ids`。
>
> **埋点流程入口**：埋点设计、代码接入、已有埋点核查、无数据诊断及验收统一遵循 `references/tracking_guide.md`；本表仅提供相关命令入口，不得使用 `raw` 绕过专用命令。

## 报表/看板创建正向规则

- Use `report_save` for report creation. Do not hand-call `/event/reportSave` unless the user explicitly asks for raw API work.
- Build `--qp` from real metadata returned by `list_events` / `list_props`: `eventId`, `eventName`, `eventDesc`, `analysis`, property names, and virtual-property names all come from metadata. Treat `eventId` + `eventName` + `eventDesc` as one atomic event identity; never hand-copy only the first two fields. `eventNameDisplay` is a metric alias and cannot replace canonical `eventDesc`.
- `report_save` / `report_edit` always re-read the `list_events` source before an event-model write, overwrite each non-formula `events[]` identity with the canonical triplet, and synchronize the same triplet into `reportRestore.data.dimensions.global`, `reportRestore.selected.correctCustom[].data.event`, and formula event references. A missing description, unknown event, or ID/name mismatch is a hard stop. `--skip-metadata-validation` skips only quota/property validation; it never skips this identity guard.
- `report_save` / `report_edit` will validate event reports against `/event/quotas` and per-event `/event/properties` before writing. Attribute aggregations such as `sum`/`avg`/`min`/`median` must set the event property in `quota` and the aggregation method in `analysis`; the generated `reportRestore` stores them as frontend `properties` + `quotas`.
- For event-model qp, include `events` and `eventView`. Let the CLI add `reportRestore`; it also fills multi-event `splitEvents`, all-event restore globals, formula restore items, and a default event-time `groupBy` when split/formula reports need one.
- 时间粒度必须与事件时间维度一致：`eventView.groupBy` 不含 `"columnName": "time"` 时，CLI 会强制 `timeParticleSize: "total"`；包含事件时间时，CLI 会使用非 `total` 粒度（缺省为 `day`），并将 `timeTypeColumnFormat` 同步为相同值。看板 `reportViewInfo` 保存时也会按报表真实维度执行同样校正。
- Formula `customEvent` operands use `event.metric` or `event.property.metric`. Numeric-property formulas must include all three segments, e.g. `charge.#vp@amount.sum/user_login.trig_user_num`.
- Put virtual-property (`#vp@...`) filters in `eventView.globalFilters`, and virtual-property breakdowns in `eventView.groupBy` when possible. Use per-metric `events[].filters`, formula `customFilters`, or hand-written restore filters only when copied from verified frontend output.
- For existing dashboards, inspect `folder_list`, `dashboard_detail`, `report_list`, and `report_detail` first. If the user says to use a specific dashboard, keep that dashboard as the target and do not create duplicates.
- After creating or changing reports, run `dashboard_analysis` or `event_analysis` with the final qp before presenting the dashboard link. Query `success` validates execution only. After adding the report to a dashboard, also use `report_detail` to verify the persisted `events[].eventDesc`, `reportRestore.data.dimensions.global.eventDesc`, and every `reportRestore.selected.correctCustom[].data.event.eventDesc` are non-empty; do not treat unchanged data as proof that the editor/dropdown restore structure is valid.
- **`timeTypeColumnFormat` 必须传**：当 `eventView.groupBy` 中包含 `"columnName": "time"` 的条目时，必须在该条目中显式携带 `"timeTypeColumnFormat"` 字段，其值必须与 `eventView.timeParticleSize` 一致。时间维度的合法值：`minute` / `hour` / `day` / `week` / `month`；`total` 只用于没有事件时间维度的报表。缺省可能导致服务端返回时间粒度校验错误。

Before final metric queries, confirm project, time/version/activity window, and metric or clear analysis intent. Use boundary prequeries first when they can derive the missing context; ask the user only when project, region, time, or metric remains ambiguous after available metadata checks.

Term mapping: when the user says `monet`, `monet 数据`, or `monetization`, treat it as 广告变现 (`ad_monet`) by default, not ordinary充值收入/`income`, unless the user explicitly asks for IAP/充值.

After project confirmation, run `sync_skills -p <project_id> -r cn`  (或 `-r sg` 查海外) and read updated `.tapdb/skills/<project_id>/` context when present.

**`-r` 可选值只有 `cn` 和 `sg`**，但脚本会自动将 `domestic`→`cn`、`overseas`→`sg`、`国内`→`cn`、`海外`→`sg`、`china`→`cn`、`global`→`sg`、`international`→`sg`。尽管如此，建议统一用 `-r cn` / `-r sg`。

Quick query: narrow command, summary output, `--limit 10`, compact table plus 1-2 lines. Deep analysis: Phase 0 boundary, Phase 1 coarse summary, Phase 2 narrow drilldown, Phase 3 concise report. Never start with daily full detail or broad multi-dimension dumps.

TapDB concurrency guardrail / 并发限制：TapDB has a strict concurrent query limit. In the same assistant turn, do not issue multiple TapDB API calls at once, whether through MCP tools or `python3 <SKILL_DIR>/scripts/tapdb_query.py`. Run TapDB queries one by one: call one command, wait for its result, summarize the finding, then decide the next command. For broad/deep analysis, use sequential batches: first query the core overview, then run only the next necessary drilldown query. Never fan out active/income/retention/source/user_value/life_cycle/version_distri/source/device/country queries at once.

429 handling：If a TapDB command returns HTTP 429 or contains `MCP查询已达到最大并发查询数`, treat it as rate limiting, not data failure. The script retries 429 with exponential backoff automatically; do not immediately launch more TapDB queries. If retries still fail, continue with already available successful results and explicitly state which query was rate-limited.

CA handling：CLI 优先使用 Python/系统 CA；默认证书库为空且环境已安装 `certifi` 时自动回退。如返回 `certificate_verify_failed`，设置 `SSL_CERT_FILE=$(python3 -m certifi)` 或修复 Python 系统证书；不要关闭 TLS 校验。

If args, dimensions, events, props, quotas, or reports are uncertain, run `python3 <SKILL_DIR>/scripts/tapdb_query.py describe <cmd>` (works for every subcommand, including TapDB 2.0 commands) or metadata commands. Prefer `describe <cmd>` over `<cmd> --help` to keep command discovery consistent. Never guess identifiers.

## 高频失败防线

- Command names: only use exact names from the quick table or `describe` with no target. Do not call `describe` on guessed names; if a name is unknown, stop guessing and return to the quick table.
- Project access: if `list_projects` does not contain the selected project_id, stop immediately and report no accessible TapDB project/permission; do not call metrics, TapDB 2.0 commands, dashboards, `sync_skills`, or `raw` with that project_id.
- Day-only commands: `retention` / `source` / `user_value` / `life_cycle` / `ad_data` must use day granularity. For weekly/monthly summaries, query day data with a narrow range and aggregate in the answer; do not pass `--group-unit week/month` to these commands.
- Dashboard analysis: keep `--qp` compact. If a request would exceed 4096 characters, do not retry the same long command; use `report_detail` or a smaller targeted `qp`.

## 执行示例

用户输入（示例假设今天是 2026-06-16；实战按当前日期重新计算“近7天”）：

> 看一下海外项目 Project X（project_id=<PROJECT_ID>）近7天 monet 数据。

正确执行（TapDB 命令串行，所有命令显式 `-r sg`）：

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py list_projects -r sg --watch-project-id <PROJECT_ID>
# 确认 <PROJECT_ID> 在海外项目列表中；若不在列表中，停止后续查询并提示不可访问/区域不匹配。

python3 <SKILL_DIR>/scripts/tapdb_query.py sync_skills -r sg -p <PROJECT_ID> --watch-project-id <PROJECT_ID>
# 若同步失败但后续数据查询成功，最终输出开头披露同步失败，不要中止已有数据输出。

python3 <SKILL_DIR>/scripts/tapdb_query.py ad_monet -r sg -p <PROJECT_ID> --watch-project-id <PROJECT_ID> -s 2026-06-10 -e 2026-06-16 -g time --limit 10
```

正确输出形态（假设工具返回了下列示例数据；实战必须使用真实工具结果，不要复用示例数字；纯查询不解释原因、不写行动建议）：

项目：Project X（<PROJECT_ID>）
时间：2026-06-10 ~ 2026-06-16
口径：广告变现（monet/ad_monet），按日期，货币：CNY，未去水

| 日期 | 广告收入 | 展示次数 | eCPM |
|---|---:|---:|---:|
| 2026-06-16 | ¥1.8万 | 235.4万 | ¥7.6 |
| 2026-06-15 | ¥1.7万 | 228.1万 | ¥7.5 |
| 2026-06-14 | ¥2.1万 | 251.0万 | ¥8.4 |

关键数据说明：近 7 天广告收入在 ¥1.7万~¥2.1万之间波动，6月14日最高；eCPM 范围为 ¥7.5~¥8.4。
每日明细已按日期倒序展示；这是纯查询结果，未做原因判断。

Load only needed packaged refs: `references/cli_usage.md` for commands; `references/physical_metadata_guide.md` for physical event/property writes; `references/metrics_glossary.md`, `references/analysis_guide.md`, `references/output_rules.md` for reports; dashboard/report guides; `references/cluster_guide.md`; `references/anomaly_checklist.md`; `references/tracking_guide.md` for 埋点接入与埋点方案.

When the user explicitly asks to add or modify a physical event/property, load `references/physical_metadata_guide.md` before constructing the command. Treat these as write operations; fetch real event/property metadata first, preserve omitted edit fields via detail readback, and never use `raw` to bypass immutable-field or ID validation.

When the user asks to create a virtual property, load `references/virtual_property_guide.md` before constructing the command. Treat it as a write operation: require an explicit create request, use `--dry-run` while validating or drafting, and never substitute `raw` or direct metadata-database writes.

When user asks to create/build a TapDB dashboard but does not provide concrete dashboard details (report list, metrics, layout, or analysis goal), first infer the game type from project metadata/context/events/dashboards. Then load only the lightweight router `references/dashboard_template_prompts.md` and the single matching file under `references/dashboard_templates/` (do not load all templates). If the type is uncertain, ask the user to confirm among likely types or load `references/dashboard_templates/generic.md` as fallback.

Guardrails: match projects by `project_name`, `remark`, `tags`; prefer `sticky: true`. Time fields: active/income/player_behavior `-g time`; retention/source/user_value/life_cycle `-g activation_time`; cost `-g dt`. Use `op_overview` for direct ad-plus `/op/op_overview` overview-cache queries (`--quota income|active|activation`, `--interval minute|hour|day|week|month`; minute/hour require `--compared-date`). Retention/source/user_value/life_cycle/ad_data are day-only. Dashboard/report answers need region-aware links. Final reports preserve `assets/report_template.md`.
