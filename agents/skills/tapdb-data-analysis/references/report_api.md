# TapDB 报表/看板 CRUD API

> 使用约定：本文是接口结构参考，不是执行入口。Skill 实战中统一使用 `python3 <SKILL_DIR>/scripts/tapdb_query.py`；创建报表前用 `list_events` 获取事件，用 `event_quotas` 获取指标，用 `event_properties` 获取指定事件属性，用 `describe report_save` 查看 qp 规则。不要手写 curl 或直接调用下方原始 API。所有接口均使用对应区域的 MCP Key 鉴权，不再传递 TapDB user ID。

## 报表构建前置查询（必须先调再构建，不要猜）

创建报表时 events 数组中的 `eventId`、`eventName`、`eventDesc`、`analysis`、`analysisDesc`、属性 `quota`/`columnName` 等值**必须先通过 CLI 元数据命令确认**，不能凭记忆或猜测填写。`eventId` + `eventName` + `eventDesc` 必须来自同一条事件记录；`eventNameDisplay` 是指标别名，不能代替事件描述。下列原始 API 说明用于理解返回结构；实际执行优先使用 `list_events`、`event_quotas`、`event_properties` 和 `describe report_save`。`report_save` / `report_edit` 会在写入前重新读取事件目录，补齐并校验身份三元组，再校验指标与属性元数据。

### 1. 获取可用事件列表

```
GET /event/events?projectId={projectId}&eventModel=event&lang=zh_CN
```

**返回**：`data` 为 `EventVo[]` 数组：
```json
[
  {"eventId": "<EVENT_ID_1>", "eventName": "demo_purchase", "eventDesc": "示例购买事件", "projectId": "<PROJECT_ID>"},
  {"eventId": "<EVENT_ID_2>", "eventName": "demo_login", "eventDesc": "示例登录事件", "projectId": "<PROJECT_ID>"}
]
```

**用途**：获取 `eventId` 和 `eventName`。**eventId 是项目级别的，不同项目同名事件 ID 不同，必须查询获取。**

**参数**：
- `eventModel`: 报表模型（event/retention/funnel/distribution/property_analysis/behavior_path）
- `lang`: 语言（zh_CN/en_US），影响 eventDesc 返回的语言

### 2. 获取可用分析指标（quotas）

```
GET /event/quotas?projectId={projectId}&eventModel=event&lang=zh_CN
```

**返回**：`data.quotas` 为按属性类型分组的指标映射：
```json
{
  "staid_type": {
    "total_times": "总次数",
    "trig_user_num": "触发账号数",
    "trig_device_num": "触发设备数",
    "trig_role_num": "触发角色数",
    "trig_battle_num": "触发战斗数",
    "per_user_times": "账号平均次数",
    "per_device_times": "设备平均次数",
    "per_role_times": "角色平均次数",
    "per_battle_times": "战斗平均次数"
  },
  "number": {
    "sum": "总和", "avg": "均值",
    "per_user_num": "账号均值", "per_device_num": "设备均值", "per_role_num": "角色均值",
    "median": "中位数", "max": "最大值", "min": "最小值", "distinct": "去重数"
  },
  "string": {"distinct": "去重数"},
  "datetime": {"distinct": "去重数"},
  "bool": {"boolean_true": "为真数", "boolean_false": "为假数", "is_empty": "为空数", "is_not_empty": "不为空数", "distinct": "去重数"},
  "array_string": {"array_distinct": "列表去重", "set_distinct": "集合去重", "array_item_distinct": "元素去重"}
}
```

**关键规则**：
- `staid_type` 指标（如 `trig_user_num`、`total_times`）**不需要选属性**，直接作用于事件本身
- `number` 指标（如 `sum`、`avg`）**必须搭配一个数值类型属性**，通过 `quota` 字段指定属性名
- `string`/`datetime` 指标只有 `distinct`
- events 条目中的 `analysis` 值必须是 quotas 返回的 key，`analysisDesc` 必须是对应的 value

**events 条目示例**：
```json
// staid_type 指标：不需要 quota 属性
{"eventId": "<EVENT_ID>", "eventName": "demo_purchase", "analysis": "trig_user_num", "analysisDesc": "触发账号数", "type": 0}

// number 指标：需要 quota 指定数值属性
{"eventId": "<EVENT_ID>", "eventName": "demo_purchase", "analysis": "sum", "analysisDesc": "总和", "quota": "demo_amount", "quotaDesc": "示例金额", "type": 0}
```

### 3. 获取事件可用属性

```
GET /event/properties?projectId={projectId}&eventModel=event&eventIds={eventId1,eventId2}
```

**参数**：
- `eventIds`: 逗号分隔的事件 ID 列表
- `eventNames`: 事件名称集合（可选，与 eventIds 二选一）
- `subject`: 主体过滤（可选）

**返回**：`data.properties` 数组，每项结构：
```json
{
  "columnIndex": 180,
  "columnType": "bigint",       // 数据类型: bigint/varchar/double/timestamp/integer
  "propId": "<PROP_ID>",
  "quota": "demo_property",      // 属性标识符（用于 filters.columnName / groupBy.columnName）
  "quotaDesc": "示例属性",        // 属性显示名
  "selectType": "number",       // 筛选类型: number/string/datetime
  "tableType": 0,               // 0=事件属性, 1=用户属性, 3=用户分群, 5=角色标签
  "virtualType": 1              // 可选，1=虚拟属性（quota 以 #vp@ 开头）
}
```

**属性命名规则**：
- 普通属性：`hero_id`, `season`, `sid`
- 虚拟属性：`#vp@coin_resource_type_big`, `#vp@shop_item_id`
- 维度表关联属性：`role_id@hero_purchase_name`（格式：`{关联字段}@{维度属性}`）
- 虚拟属性关联维度表：`#vp@shop_item_id@type_name`

### 其他属性端点

```
GET /meta/metaEventDetail?projectId={projectId}&eventId={eventId}   # 事件详情（含关联属性列表）
GET /meta/metaPropDetail?projectId={projectId}&propId={propId}     # 属性详情
GET /event/getPropertyInterval?projectId={projectId}&propName={name}&tableType={tableType}  # 属性区间配置
```

---

## 报表 CRUD

### 创建报表

优先使用 `report_save`，由 CLI 根据 `events` + `eventView` 生成前端所需的 `reportRestore`。
以下底层接口仅作 API 映射参考。

```
POST /event/reportSave
参数: projectId, reportName(1-64字符), reportModel, qp(URL-encoded JSON), reportDesc(可选)
```
- `qp` 包含 `events` + `eventView` + `reportRestore`
- CLI 会把规范事件三元组同步到 `events[]`、`reportRestore.data.dimensions.global`、`reportRestore.selected.correctCustom[].data.event` 和公式事件项。事件目录缺少 `eventDesc`，或传入 ID/名称互相冲突时，写入会被拒绝；`--skip-metadata-validation` 也不会绕过这项检查。
- `eventView.groupBy` 不含事件时间 `time` 时，`timeParticleSize` 必须为 `total`；包含事件时间时，粒度必须为非 `total`，且 `timeTypeColumnFormat` 与之相同。CLI 会在写入前自动校正。

### 编辑/更新报表

```
POST /event/reportEdit
参数: projectId, reportId, reportModel, qp(URL-encoded JSON), reportName(可选), reportDesc(可选)
```
- 传完整 qp（包含 `events` + `eventView` + `reportRestore`）
- 权限：报表创建者或协作者

报表加入看板后使用 `report_detail` 回读并检查 `events[].eventDesc`、`reportRestore.data.dimensions.global.eventDesc`、`reportRestore.selected.correctCustom[].data.event.eventDesc` 均非空。分析接口返回 `success` 只说明查询可执行，不能替代恢复结构检查。

### 删除报表

```
POST /event/reportDel
参数: projectId, reportId
```
- **软删除**：服务端将报表标记为删除状态。
- **级联**：服务端同步清理看板中的报表关联。
- 权限：仅报表创建者

### 报表列表 / 详情

```
GET /event/reportList   参数: projectId, reportName(可选), reportModel(可选)
GET /event/reportDetail 参数: projectId, reportId
```

---

## 看板-报表关联管理

### 文件夹列表

```
GET /dashboard/folderList?projectId={projectId}&showShareFolder=true
```

### 更新看板报表列表

```
POST /dashboard/updateDashboardReports
参数: projectId, dashboardId, orderString(JSON数组如[<REPORT_ID_1>,<REPORT_ID_2>]), coordinate(可选)
```

### 从看板移除单个报表

```
POST /dashboard/dashboardReportMappingDel
参数: projectId, dashboardId, reportId
```

### 看板内报表排序

```
POST /dashboard/reportReorder
参数: projectId, dashboardId, orderString(JSON对象如{"<REPORT_ID_1>":1,"<REPORT_ID_2>":2})
```

### 保存报表显示设置

```
POST /dashboard/saveDashboardReportSetting
参数: projectId, dashboardId, reportId, reportViewInfo, reportName, reportDesc(可选)
```

### 获取报表详情（看板上下文）

```
GET /dashboard/dashboardReportDetail
参数: projectId, dashboardId, reportId
```
- 返回报表配置 + 可用图表类型 `visual_chart_types` + 窗口尺寸 `window_sizes`

---

## 报表数据结构

### events 字段格式

**标准指标（type=0）**：
```json
{
  "eventId": "<EVENT_ID>",
  "eventDesc": "示例购买事件",
  "eventName": "demo_purchase",
  "eventNameDisplay": "购买人数",
  "type": 0,
  "analysis": "trig_user_num",
  "analysisDesc": "触发账号数",
  "filters": [{"columnType":"varchar","tableType":0,"calculateSymbol":"eq","ftv":["示例值"],"selectType":"string","columnName":"demo_property"}],
  "relation": "and"
}
```

**自定义公式（type=1）**：
```json
{
  "eventDesc": "购买率",
  "customEvent": "demo_purchase.trig_user_num/demo_login.trig_user_num",
  "dataFormat": "percent",
  "eventName": "",
  "eventSplitIndex": [0, 1],
  "type": 1,
  "customFilters": []
}
```

### calculateSymbol 可选值

| 值 | 说明 | 值 | 说明 |
|----|------|----|------|
| `eq` | 等于 | `un_eq` | 不等于 |
| `gt` | 大于 | `lt` | 小于 |
| `include` | 包含于（IN） | `un_include` | 不包含于 |
| `regular_match` | 正则匹配 | `empty` / `not_empty` | 为空/不为空 |
| `boolean_false` | 布尔假 | `rel_event_time` | 相对事件时间 |

### dataFormat 可选值

| 值 | 说明 |
|----|------|
| `percent` | 百分比 |
| `twoBit` | 两位小数 |
| `integer` | 整数 |

### coordinate 布局

12 列网格，key 为 report_id：
```json
{"12535": {"x": 0, "y": 0, "w": 12, "h": 8}}
```
