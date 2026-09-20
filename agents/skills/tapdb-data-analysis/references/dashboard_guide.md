# 看板创建与配置指南

本文档包含看板创建、报表参数格式、显示设置、布局配置的完整参考。

## 创建看板流程

```
1. folder_list      → 获取文件夹列表（找到目标 folderId）
2. dashboard_save   → 在目标文件夹下新建看板 → 返回 dashboardId
3. report_save      → 创建报表（定义查询逻辑）→ 返回 reportId
4. dashboard_add_reports → 将报表添加到看板（设置网格布局 coordinate）
5. report_detail    → 回读并检查事件描述在 qp/reportRestore 中均完整
6. dashboard_report_setting → 配置每个报表的显示样式（图表类型、时间粒度等）
7. dashboard_analysis → 验证每个报表查询无报错
```

> **重要**：创建报表优先使用 `report_save`。该命令会基于 `events` + `eventView`
> 规范化 event qp，自动生成前端 `reportRestore`，并补齐多事件、公式报表所需的
> `splitEvents` / 时间维度 `groupBy` / restore 公式项。具体规则可直接运行
> `describe report_save` 查看。
> 现有报表需要原地修复时使用 `report_edit`，默认会重建 `reportRestore`。

## 报表 qp 参数格式

> **重要**：构建 qp 前，必须通过 CLI 元数据命令获取正确的 `eventId`、`eventName`、`eventDesc`、analysis、属性名等值，**不要凭记忆猜测**。把前三者视为来自同一条 `list_events` 记录的原子身份；`eventNameDisplay` 只是指标别名，不能替代 `eventDesc`。实际操作用 `list_events` / `event_quotas` / `event_properties` / `describe report_save`。`report_save` 和 `report_edit` 写入前会重新读取事件目录并补齐/校验身份三元组，再校验 `/event/quotas` 与按事件过滤的 `/event/properties`。

`report_save --qp` 需要 JSON 字符串，包含 `events` 和 `eventView`：

```json
{
  "events": [{
    "eventId": "<EVENT_ID>",
    "eventName": "device_login",
    "eventDesc": "App 启动",
    "eventNameDisplay": "DAU",
    "type": 0,
    "analysis": "trig_user_num",
    "analysisDesc": "触发账号数"
  }],
  "eventView": {
    "groupBy": [{
      "columnType": "timestamp", "tableType": 0,
      "timeTypeColumnFormat": "day", "selectType": "datetime",
      "propType": "staid_prop", "columnDesc": "事件发生时间", "columnName": "time"
    }],
    "startTime": "2026-03-17",
    "endTime": "2026-03-23",
    "timeParticleSize": "day",
    "projectId": "<PROJECT_ID>"
  }
}
```

- `events[].type`: 0=物理事件, 其他参考 `list_events` 返回
- `events[].eventId` / `eventName` / `eventDesc`: 必须来自同一条事件元数据。CLI 会在写入前用真实事件目录覆盖规范值，并同步到 `reportRestore.data.dimensions.global`、`reportRestore.selected.correctCustom[].data.event` 和公式事件引用；任一事件描述为空或 ID/名称冲突都会停止写入。
- `events[].analysis`: 分析方法，**必须使用下划线格式（snake_case）**，不能用驼峰。后端通过字符串精确匹配来生成 SQL 聚合列，格式不对会导致 `Column 'amount_0' cannot be resolved` 错误
- 事件信息通过 `list_events` 获取
- 属性聚合指标（如 `sum` / `avg` / `max` / `min` / `median`）必须同时填写：
  - `quota`: 当前事件真实属性，来自 `event_properties --event-ids <eventId>`
  - `analysis`: 聚合方式，来自 `event_quotas`

示例：

```json
{
  "eventId": "<EVENT_ID>",
  "eventName": "speedrun_challenge_result",
  "eventDesc": "数仓-竞速挑战结算",
  "eventNameDisplay": "挑战耗时中位数",
  "type": 0,
  "quota": "challenge_duration",
  "quotaDesc": "挑战耗时",
  "analysis": "median",
  "analysisDesc": "中位数"
}
```

**analysis 可用值速查（下划线格式）**：

| analysis（必须下划线格式） | 含义 | 适用场景 |
|---|---|---|
| `total_times` | 总次数 | 所有事件 |
| `trig_user_num` | 触发账号数 | 所有事件 |
| `trig_device_num` | 触发设备数 | 所有事件 |
| `trig_role_num` | 触发角色数 | 有角色ID的事件 |
| `per_capita_times` | 账号平均次数 | 所有事件 |
| `per_device_times` | 设备平均次数 | 所有事件 |
| `per_role_times` | 角色平均次数 | 有角色ID的事件 |
| `sum` / `avg` / `max` / `min` / `median` | 数值聚合 | 数值类型属性 |
| `distinct` | 去重数 | 所有类型属性 |

加入看板后必须用 `report_detail` 回读持久化结构，并确认以下字段均非空：

- `events[].eventDesc`
- `reportRestore.data.dimensions.global.eventDesc`
- `reportRestore.selected.correctCustom[].data.event.eventDesc`

`dashboard_analysis` / `event_analysis` 返回 `success` 只表示查询可执行；数据未变化也不能证明前端下拉框依赖的恢复结构完整。

## 网格布局 (coordinate)

12 列网格系统，每个报表用 `{x, y, w, h}` 定位：

| 布局 | coordinate 示例 |
|------|----------------|
| 两列并排 | `{"id1":{"x":0,"y":0,"w":6,"h":8},"id2":{"x":6,"y":0,"w":6,"h":8}}` |
| 全宽单列 | `{"id1":{"x":0,"y":0,"w":12,"h":8}}` |
| 三列均分 | `{"id1":{"x":0,"y":0,"w":4,"h":8},"id2":{"x":4,"y":0,"w":4,"h":8},"id3":{"x":8,"y":0,"w":4,"h":8}}` |

## reportViewInfo 显示设置

`dashboard_report_setting --report-view-info` 控制报表在看板中的显示方式。

存储位置：由看板服务保存为报表显示配置（URL-encoded JSON）。

### 必填字段

**`startTime`、`endTime`、`dateKey`、`dateDiff`、`dateFormat` 为必填字段**，缺少会导致看板定时刷新 NPE 报错（`startTime is null`）。

### 按报表模型 (reportModel) 区分的完整字段

**Event 模型**（最常用）：

```json
{
  "startTime": "2026-02-23",
  "endTime": "2026-03-24",
  "dateKey": "D|29|0",
  "dateDiff": 2505600,
  "dateFormat": 0,
  "timeParticleSize": "day",
  "visualChartType": "trend",
  "visualModuleType": "m1",
  "visualModuleSize": "middle",
  "displayQuotas": ["total_times"],
  "displayGroups": ["国家或地区"],
  "dimensionSortableData": {
    "isSort": true,
    "topNumber": 10,
    "isValid": true,
    "type": "value-desc"
  },
  "isGroupSelectAll": false,
  "hideTableColumnRation": false
}
```

**Retention 模型**：Event 字段 + `showType`("retention"/"loss"), `unitNum`(留存天/周/月数), `isUseKeypointDate`(bool), `isShowCurrentDay`(bool)

**Funnel 模型**：`startTime`, `endTime`, `dateKey`, `visualModuleType`, `visualModuleSize`, `showWay`("trend"/"contrast"), `showType`("conversion"/"loss"), `step`([0])

**Distribution 模型**：Event 字段 + `startTimeCompared`, `endTimeCompared`, `dateKeyCompare`（对比时间范围）

**Property Analysis 模型**：`displayQuotas`, `displayGroups`, `visualChartType`, `visualModuleType`, `visualModuleSize`, `dimensionSortableData`

### 各字段详解

**时间范围（必填）**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `startTime` | 起始日期 | `"2026-02-23"` |
| `endTime` | 结束日期 | `"2026-03-24"` |
| `dateDiff` | 时间跨度秒数 | `2505600`(29天) / `518400`(6天) |
| `dateFormat` | 日期格式，固定传 0 | `0` |

**dateKey（相对日期）**：

| 值 | 说明 | 值 | 说明 |
|----|------|----|------|
| `D0` | 今日 | `D1` | 昨日 |
| `D7` | 最近7日 | `D8` | 过去7日 |
| `D30` | 最近30日 | `D31` | 过去30日 |
| `W0` | 本周 | `W1` | 上周 |
| `M0` | 本月 | `M1` | 上月 |
| `D\|x\|y` | 动态相对：过去x到y日 | `LD\|date\|y` | 锁定起始日期到过去y天 |

对比时间：`DC1`(上一日) / `WC1`(上一周) / `MC1`(上一月) / `LC1`(上一周期)

**timeParticleSize（时间粒度）**：

| 值 | 说明 |
|----|------|
| `minute` | 按分钟 |
| `hour` | 按小时 |
| `day` | 按天 |
| `week` | 按周 |
| `month` | 按月 |
| `total` | 合计（用于数值卡片） |

时间粒度必须与 `eventView.groupBy` 中的事件时间维度一致：

- 不包含 `{"columnName":"time"}` 时必须使用 `total`，否则前端会错误开放按天、小时、分钟等选项，但查询不会真正按时间分组。
- 包含 `{"columnName":"time"}` 时必须使用 `minute` / `hour` / `day` / `week` / `month` 之一，并让该维度的 `timeTypeColumnFormat` 与 `timeParticleSize` 相同。
- `report_save` / `report_edit` 和 `dashboard_report_setting` 会自动执行上述校正。

注意：多事件 / 自定义公式报表如果声明了 `splitEvents`，`eventView.groupBy` 不能空，否则后端会报 `group_items null` / `The expression 'group_items' evaluated to a null value`。即使是单日 KPI 公式，也建议使用 `startTime=endTime` + 按天时间维度，而不是空 groupBy。`timeParticleSize: "total"` 更适合单事件数值卡片。

**visualChartType（图表类型）**：

| 值 | UI 名称 | 适用场景 |
|----|---------|---------|
| `trend` | 趋势图 | 时间序列，最常用 |
| `stack` | 数值堆积图 | 多分组按时间堆叠 |
| `ratio_stack` | 比例堆积图 | 查看各分组占比变化 |
| `accumulate` | 累计图 | 累计面积展示 |
| `distribute` | 饼状分布图 | 查看分组占比 |
| `columnar_distribute` | 柱状分布图 | 柱形对比分布 |
| `numeric` | 数值卡片 | 单一 KPI 数值展示 |
| `table` | 数据表 | 明细表格 |

可用图表类型取决于 analysis 类型、是否有时间维度、是否有分组维度，可通过 `dashboardReportDetail` 接口获取 `visual_chart_types`。

**visualModuleType（图表尺寸/模块类型）**：

前缀 `s`=小 / `m`=中 / `b`=大，数字表示维度和事件数量组合：

| 值 | 尺寸 | 条件 |
|----|------|------|
| `s1` | 小 | 0 维度, 1 事件, 非合计, 有 numeric |
| `s2` | 小 | 0 维度, 1 事件, 合计(total), 有 numeric |
| `m1` / `b1` | 中/大 | 0 维度, 1 事件, 有 trend/accumulate |
| `m3` / `b3` | 中/大 | 0 维度, ≥2 事件; 或有 columnar_distribute |
| `m4` / `b4` | 中/大 | ≥1 维度, 1 事件 |
| `m5` / `b5` | 中/大 | ≥1 维度, ≥2 事件 |
| `m6` / `b6` | 中/大 | ≥1 维度, 有 distribute(饼图) |
| `m7` / `b7` | 中/大 | 任何组合, 有 table |

**visualModuleSize（尺寸名称）**：需与 visualModuleType 前缀一致

| 值 | 对应前缀 |
|----|---------|
| `small` | `s` |
| `middle` | `m` |
| `big` | `b` |

**displayQuotas（展示指标）**：控制多指标时显示哪些，值为 analysis 字符串数组

常用值：`total_times`, `trig_user_num`, `trig_device_num`, `trig_role_num`, `per_capita_times`, `sum`, `avg`, `max`, `min`, `median`, `distinct`

**displayGroups（展示分组）**：控制显示哪些分组维度值，值为维度显示名称(columnDesc)数组

示例：`["中国","美国","日本"]` 或 `["Android","iOS"]`

**dimensionSortableData（维度排序）**：

```json
{
  "isSort": true,
  "topNumber": 10,
  "isValid": true,
  "type": "value-desc"
}
```

- `type`: `"value-desc"`(值降序) / `"value-asc"`(值升序)
- `topNumber`: Top N 展示数量

**其他字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `isGroupSelectAll` | bool | 是否全选分组 |
| `hideTableColumnRation` | bool | 是否隐藏表格列占比（false=显示） |

### 常用看板卡片配方

**数值摘要卡片**（今日 KPI 一览）：
```json
{
  "startTime": "2026-03-25", "endTime": "2026-03-25",
  "dateKey": "D0", "dateDiff": 0, "dateFormat": 0,
  "timeParticleSize": "total",
  "visualChartType": "numeric",
  "visualModuleType": "s2", "visualModuleSize": "small"
}
```
配合 coordinate `{"w":3,"h":4}` 可四列并排放置。

如果数值卡片是公式指标（例如 ARPU = 收入/DAU、付费率 = 付费人数/DAU），请不要使用空 `groupBy`。改为：`startTime=endTime`、`timeParticleSize:"day"`、`groupBy:[time]`，否则可能触发 `group_items null`。

**30 天趋势图**：
```json
{
  "startTime": "2026-02-23", "endTime": "2026-03-24",
  "dateKey": "D|29|0", "dateDiff": 2505600, "dateFormat": 0,
  "timeParticleSize": "day",
  "visualChartType": "trend",
  "visualModuleType": "m1", "visualModuleSize": "middle",
  "hideTableColumnRation": false
}
```

**分维度堆叠柱图**（带 Top10 排序）：
```json
{
  "startTime": "2026-02-23", "endTime": "2026-03-24",
  "dateKey": "D|29|0", "dateDiff": 2505600, "dateFormat": 0,
  "timeParticleSize": "day",
  "visualChartType": "stack",
  "visualModuleType": "m4", "visualModuleSize": "middle",
  "dimensionSortableData": {"isSort": true, "topNumber": 10, "isValid": true, "type": "value-desc"},
  "isGroupSelectAll": true,
  "hideTableColumnRation": false
}
```

### 推荐看板布局模式

```
┌────┬────┬────┬────┐  y=0  数值摘要 (s2, numeric, w=3, h=4)
├─────────┬──────────┤  y=4  核心趋势 (m1, trend, w=6, h=8)
├─────────┼──────────┤  y=12
├─────────┼──────────┤  y=20
├─────────┼──────────┤  y=28 维度分布 (m4, stack, w=6, h=8)
├────────────────────┤  y=36 全宽分布 (b4, stack, w=12, h=8)
└────────────────────┘
```
