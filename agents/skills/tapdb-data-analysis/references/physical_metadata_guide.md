# TapDB 物理事件与属性维护指南

## 能力边界

- 新增物理事件：`event_save` → `POST /meta/addMetaEvent`
- 修改物理事件：`event_edit` → 回读 `GET /meta/metaEventDetail` 后调用 `POST /meta/editMetaEvent`
- 新增物理属性：`property_save` → 校验 `GET /meta/getSelectAndColumnTypeMap` 后调用 `POST /meta/addMetaProp`
- 修改物理属性：`property_edit` → 回读 `GET /meta/metaPropDetail` 后调用 `POST /meta/editMetaProp`
- 仅支持普通物理事件和物理属性。虚拟属性使用 `virtual_property_save`；虚拟事件当前不在本能力范围内。
- 以上均为写操作。只有用户明确要求新增或修改时才执行；不要用 `raw` 代替正式命令。

## 修改边界

前端编辑表单与后端校验共同限制以下字段不可修改：

| 对象 | 不可修改 | 可以修改 |
|---|---|---|
| 事件 | `eventName` | `eventDesc`、`status`、`dataSwitch`、`remark`、完整属性关联列表 |
| 属性 | `columnName`、`columnType`、`selectType`、`tableType` | `columnDesc`、`unit`、`status`、`dataSwitch`、`remark` |

编辑命令未传的可修改字段会从详情接口保留。不要自行补默认值覆盖现有数据。

## 命名与长度

- 事件名和物理属性名：英文字母开头，只能包含英文字母、数字、下划线，长度 2～100 字符。
- 显示名必填，最多 100 字符。
- 说明、单位最多 100 字符。
- `status` 仅用 `display` 或 `hide`；`dataSwitch` 仅用 `on` 或 `off`。
- 新增事件或属性前，应先用 `list_events` 或 `list_props` 检查是否已有同名或同显示名元数据。最终唯一性仍由服务端校验。

## 属性类型

新增物理属性时，命令会读取服务端 `meta/getSelectAndColumnTypeMap` 校验 `columnType` 与 `selectType`，不要猜类型组合。当前前端通常支持：

- `varchar` + `string`
- `varchar` + `array_string`
- `integer` + `number`
- `bigint` + `number`
- `double` + `number`
- `boolean` + `bool`
- `timestamp` + `datetime`

以接口当次返回为准。

## 事件关联属性

- 新增事件前，先执行 `list_props -p <PROJECT_ID> -t 0`，从当前项目事件属性中取得真实 `propId`。
- `event_save --prop-ids 101,102` 会校验 ID 后创建事件。
- `event_edit --prop-ids 101,102` 表示保存后的**完整物理属性关联列表**，不是增量追加。
- 编辑时省略 `--prop-ids` 会保留现有 `presetProp` 和 `customProp`；显式传空字符串会清空全部物理属性关联。
- 虚拟属性不通过 `propIds` 关联；其映射由虚拟属性能力维护。

## 推荐流程

1. `list_projects` 确认项目与区域。
2. 新增事件或属性前分别查询 `list_events` 或 `list_props`，避免重复。
3. 新增事件如需关联属性，先从 `list_props -t 0` 获取 `propId`。
4. 调用对应正式写命令。
5. 写入后重新执行 `list_events` 或 `list_props` 验证。

## 示例

```bash
# 新增事件属性
python3 <SKILL_DIR>/scripts/tapdb_query.py property_save -p <PROJECT_ID> -r cn \
  --table-type 0 --column-name item_id --display-name "道具 ID" \
  --column-type varchar --select-type string --remarks "道具唯一标识"

# 新增事件并关联已有属性
python3 <SKILL_DIR>/scripts/tapdb_query.py event_save -p <PROJECT_ID> -r cn \
  --event-name item_use --display-name "使用道具" \
  --prop-ids 101,102 --remarks "道具系统消耗事件"

# 修改事件显示名，其他字段和属性关联保持不变
python3 <SKILL_DIR>/scripts/tapdb_query.py event_edit -p <PROJECT_ID> -r cn \
  --event-id <EVENT_ID> --display-name "消耗道具"

# 修改属性显示名与状态；名称、类型、主体从详情回读并保持不变
python3 <SKILL_DIR>/scripts/tapdb_query.py property_edit -p <PROJECT_ID> -r cn \
  --prop-id <PROP_ID> --display-name "道具标识" --status hide
```
