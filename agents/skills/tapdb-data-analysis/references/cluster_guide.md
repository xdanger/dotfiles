# 用户分群创建规则指南

> 来源：`list_clusters` 返回的 `userClusterDefRestore` 结构。创建/编辑条件分群时，`cluster_save --qp` 和 `cluster_edit --qp` 可以直接传这类 restore JSON；CLI 会自动补出后端实际需要的 `{userClusterDef,userClusterDefRestore}` 包装。

## 创建前置检查

创建分群前必须先查元数据，不要凭记忆拼字段：

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py list_clusters -p <project_id> -r cn
python3 <SKILL_DIR>/scripts/tapdb_query.py list_events -p <project_id> -r cn -k <事件关键词>
python3 <SKILL_DIR>/scripts/tapdb_query.py list_props -p <project_id> -r cn -t 0   # 事件属性
python3 <SKILL_DIR>/scripts/tapdb_query.py list_props -p <project_id> -r cn -t 1   # 账号/用户属性
python3 <SKILL_DIR>/scripts/tapdb_query.py list_props -p <project_id> -r cn -t 2   # 设备属性
```

- 先用 `list_clusters` 避免 `clusterName` 冲突。
- 事件条件里的 `eventId` / `eventName` / `eventDesc` 必须来自 `list_events`。
- 属性过滤里的 `propId` / `quota` / `quotaDesc` / `columnType` / `columnIndex` / `selectType` / `tableType` 必须来自 `list_props`。
- 如果已有相似分群，优先复制它的 `userClusterDefRestore`，只替换事件、属性、时间和阈值。

## refreshType

`refreshType` 以接口返回为准：

| 值 | 含义 | 常见用途 |
|---|---|---|
| `0` | 自动更新 | 长期运营分群 |
| `1` | 手动更新 | 临时分析、活动分群 |
| `2` | 不更新 | 上传 ID 分群、结果分群 |

条件分群通常用 `0` 或 `1`；上传文件分群通常用 `2`。

## 条件分群 qp 骨架

CLI 输入使用前端 restore 结构：

```json
{
  "customRelation": {
    "first": "and",
    "second": "and"
  },
  "custom": [],
  "globalDimension": {
    "items": [],
    "relation": "and"
  }
}
```

提交到 TapDB 后端时会自动转换为：

```json
{
  "userClusterDef": {
    "eventsFiltersRelation": "and",
    "eventsRelation": "and",
    "events": [],
    "filtersRelation": "and",
    "filters": []
  },
  "userClusterDefRestore": {
    "customRelation": {
      "first": "and",
      "second": "and"
    },
    "custom": [],
    "globalDimension": {
      "items": [],
      "relation": "and"
    }
  }
}
```

如果你已经有完整包装后的对象，也可以直接作为 `--qp` 传入；不要手动 URL 编码，CLI 的 form POST 会处理编码。

字段含义：

| 字段 | 说明 |
|---|---|
| `custom` | 行为/事件指标条件列表 |
| `globalDimension.items` | 用户/设备等全局属性过滤列表 |
| `customRelation.first` | `custom` 条件块与 `globalDimension` 条件块之间的关系，`and` / `or` |
| `customRelation.second` | `custom[]` 内多个行为条件之间的关系，`and` / `or` |
| `globalDimension.relation` | `globalDimension.items[]` 内多个属性过滤之间的关系，`and` / `or` |

只有一侧条件时，关系字段也保留，默认写 `and`。

## 行为条件 custom[]

```json
{
  "date": {
    "beginDate": "2026-04-01",
    "endDate": "2026-04-30",
    "chooseDateKey": ""
  },
  "doing": "1",
  "identify": "<random_hex>",
  "data": {
    "identify": "<random_hex>",
    "name": "",
    "isLoadFilter": false,
    "filters": {
      "items": [],
      "relation": "and"
    },
    "event": {
      "eventId": "<EVENT_ID>",
      "eventDesc": "示例登录事件",
      "eventName": "demo_login",
      "projectId": "<PROJECT_ID>"
    },
    "isShowEditName": false,
    "properties": {
      "quotaDesc": "次数",
      "quota": "times"
    }
  },
  "quotaDist": {
    "choose": {
      "value": "大于",
      "key": "gt"
    },
    "value": [0]
  },
  "type": "index"
}
```

规则：

- `doing`: `"1"` 表示做过/命中该行为；`"0"` 表示未做过/排除该行为。
- `type`: 目前条件分群使用 `"index"`。
- `date.beginDate` / `date.endDate`: 绝对日期，格式 `YYYY-MM-DD`。
- `date.chooseDateKey`: 绝对日期可留空；相对日期只在复制已有配置时保留，不要凭空拼。
- `data.properties`: 行为次数用 `{"quotaDesc":"次数","quota":"times"}`。
- 当按事件属性聚合时，增加 `data.quotas`，例如总充值金额：

```json
{
  "quotas": {
    "quotaDesc": "总和",
    "quota": "sum"
  },
  "properties": {
    "quotaDesc": "充值金额",
    "quota": "charge_amount"
  }
}
```

`identify` 是前端配置节点 ID，使用 32 位随机 hex 即可，且同一个 `qp` 内不要重复：

```bash
python3 -c 'import uuid; print(uuid.uuid4().hex)'
```

## 属性过滤 items[]

事件内过滤写在 `custom[].data.filters.items[]`；全局用户/设备过滤写在 `globalDimension.items[]`。二者结构相同：

```json
{
  "filter": {
    "value": "等于",
    "key": "eq"
  },
  "identify": "<random_hex>",
  "history": {
    "type": "LATEST"
  },
  "dimension": {
    "columnType": "varchar",
    "tableType": 1,
    "quotaDesc": "设备系统类型",
    "hasDict": false,
    "identify": "<PROP_NODE_ID>_1",
    "propId": "<PROP_ID>",
    "quota": "os",
    "columnIndex": 33,
    "selectType": "string",
    "propType": "user_prop"
  },
  "value": ["Android"]
}
```

`dimension` 必须从 `list_props` 复制。常见映射：

| 来源 | `tableType` | `propType` |
|---|---:|---|
| 事件属性 | `0` | `event_prop` |
| 账号/用户属性 | `1` | `user_prop` |
| 设备属性 | `2` | `device_prop` |

常用比较符：

| key | value | 典型 value |
|---|---|---|
| `eq` | 等于 | `["Android"]` 或 `[1]` |
| `ne` | 不等于 | `["iOS"]` |
| `gt` | 大于 | `"100"` 或 `[100]` |
| `gte` | 大于等于 | `"100"` 或 `[100]` |
| `lt` | 小于 | `"100"` 或 `[100]` |
| `lte` | 小于等于 | `"100"` 或 `[100]` |
| `range` | 区间 | `[100, 500]` |
| `abs_time_range` | 绝对时间 | `["2026-04-01 00:00:00.000", "2026-04-30 23:59:59.999"]` |

数值字段在现有配置中既有字符串也有数组写法；新规则优先保持与同项目已有分群一致。

## 示例 1：近 7 日登录用户

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py cluster_save -p <project_id> -r cn \
  --cluster-name condition_20260506_login_7d \
  --display-name '近7日登录用户' \
  --subject user \
  --refresh-type 1 \
  --qp '{"customRelation":{"first":"and","second":"and"},"custom":[{"date":{"beginDate":"2026-04-30","endDate":"2026-05-06","chooseDateKey":""},"doing":"1","identify":"<random_hex>","data":{"identify":"<random_hex>","name":"","isLoadFilter":false,"filters":{"items":[],"relation":"and"},"event":{"eventId":"<EVENT_ID>","eventDesc":"示例登录事件","eventName":"demo_login","projectId":"<PROJECT_ID>"},"isShowEditName":false,"properties":{"quotaDesc":"次数","quota":"times"}},"quotaDist":{"choose":{"value":"大于","key":"gt"},"value":[0]},"type":"index"}],"globalDimension":{"items":[],"relation":"and"}}'
```

## 示例 2：14 天未登录且历史付费大于 150 元

```json
{
  "customRelation": {
    "first": "and",
    "second": "and"
  },
  "custom": [{
    "date": {
      "beginDate": "2026-04-23",
      "endDate": "2026-05-06",
      "chooseDateKey": ""
    },
    "doing": "0",
    "identify": "<random_hex>",
    "data": {
      "identify": "<random_hex>",
      "name": "",
      "filters": {
        "items": [],
        "relation": "and"
      },
      "event": {
        "eventId": "<EVENT_ID>",
        "eventDesc": "示例登录事件",
        "eventName": "demo_login",
        "projectId": "<PROJECT_ID>"
      },
      "isShowEditName": false,
      "properties": {
        "quotaDesc": "次数",
        "quota": "times"
      }
    },
    "quotaDist": {
      "choose": {
        "value": "大于",
        "key": "gt"
      },
      "value": [0]
    },
    "type": "index"
  }],
  "globalDimension": {
    "items": [{
      "filter": {
        "value": "大于",
        "key": "gt"
      },
      "identify": "<random_hex>",
      "history": {
        "type": "LATEST"
      },
      "dimension": {
        "columnType": "bigint",
        "tableType": 1,
        "quotaDesc": "充值总金额",
        "hasDict": false,
        "identify": "<propId>_1",
        "propId": "<PROP_ID>",
        "quota": "total_charge_amount",
        "columnIndex": 53,
        "selectType": "number",
        "propType": "user_prop"
      },
      "value": "15000"
    }],
    "relation": "and"
  }
}
```

金额字段的单位以项目属性定义为准；示例里的 `15000` 表示“分”为单位时的 150 元，实际使用前必须确认属性口径。

## 文件分群

上传 ID 分群使用 `--file-path`，通常不需要 `--qp`：

```bash
python3 <SKILL_DIR>/scripts/tapdb_query.py cluster_save -p <project_id> -r cn \
  --cluster-name file_20260506_recall_ids \
  --display-name '召回名单-20260506' \
  --subject user \
  --refresh-type 2 \
  --file-path /path/to/user_ids.csv
```

文件格式、ID 类型和 `subject` 必须一致：账号名单用 `--subject user`，设备名单用 `--subject device`。

## 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| 创建成功但人数为 0 | `subject` 与事件/属性主体不一致 | 确认分群主体和事件主体 |
| 后端报字段不存在 | `eventId` / `propId` / `quota` 不是当前项目的 | 重新跑 `list_events` / `list_props` |
| 过滤不生效 | `dimension.tableType` 或 `propType` 写错 | 直接复制 `list_props` 返回字段 |
| 自动/手动刷新不符合预期 | `refreshType` 写错 | 使用 `0=自动, 1=手动, 2=不更新` |
| 相对时间窗口异常 | 手写了 `chooseDateKey` | 绝对日期留空；相对日期复制已有配置 |
