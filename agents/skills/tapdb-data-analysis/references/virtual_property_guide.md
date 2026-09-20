# TapDB 计算虚拟属性创建指南

## 能力边界

- 正式命令：`virtual_property_save`
- 正式接口：`POST /virtualMeta/addMetaProp`
- SQL 预检：`POST /virtualMeta/sqlInspect`
- 指定事件解析：`GET /virtualMeta/listMetaEvent`
- 禁止使用 `raw` 代替，禁止绕过 CLI 直接写内部元数据存储。
- 只有用户明确要求创建时才执行真实写入；信息收集、方案确认和排错阶段使用 `--dry-run`。

## 必填字段

| CLI 参数 | 后端字段 | 说明 |
|---|---|---|
| `-p` | `projectId` | 已通过同区域 `list_projects` 验证的项目 ID |
| `--table-type` | `tableType` | `0` 事件、`1` 账号、`2` 设备 |
| `--column-name` | `columnName` | 可省略 `#vp@`；名称仅允许字母、数字、下划线，前缀后最多 96 位 |
| `--display-name` | `columnDesc` | 显示名，最多 100 字符 |
| `--column-type` | `columnType` | 存储类型 |
| `--select-type` | `selectType` | 分析类型，必须与存储类型匹配 |
| `--sql` | `columnRule` | 单个 SQL 表达式，不写 `SELECT` |

命令固定提交 `virtualType=1`、`metaPropType=custom`，默认 `status=display`。

## 类型组合

仅允许这些已由后端类型枚举和现网元数据共同验证的组合：

- `varchar/string`
- `varchar/array_string`
- `double/number`
- `integer/number`
- `bigint/number`
- `boolean/bool`
- `timestamp/datetime`

## 事件关联

仅事件虚拟属性（`--table-type 0`）使用以下参数：

- `--relation-type 0`：自动识别关联事件，默认值。
- `--relation-type 1`：关联全部事件。
- `--relation-type 2 --event-ids ...`：关联指定事件；至少一个 ID，命令会调用 `virtualMeta/listMetaEvent` 校验并补齐完整事件对象。
- `--relation-table-type 0`：不关联用户主体，默认值。
- `--relation-table-type 1`：关联账号；SQL 中账号属性使用 `t_user.<属性>`。
- `--relation-table-type 2`：关联设备；SQL 中设备属性使用 `t_user.<属性>`。

账号/设备虚拟属性不接受事件关联参数。

## SQL 规则

- SQL 必须是表达式，例如 `charge_amount / 100.0`，不要写 `SELECT`。
- 属性名必须来自 `list_props`；指定事件 ID 必须来自 `list_events`。
- SQL 至少引用一个真实属性。
- 聚合函数不适用于普通逐行计算属性；窗口或聚合类旧数据不能作为新建模板直接照抄。
- 命令先调用 `sqlInspect`；服务端保存时还会再次解析 SQL、生成执行规则，并自动维护属性和事件映射。

## 推荐流程

1. `list_projects` 确认项目与区域。
2. `list_props` 获取真实属性名；指定事件时再用 `list_events` 获取事件 ID。
3. 使用完整创建命令加 `--dry-run`，确认规范化 payload、依赖属性和双引擎 SQL。
4. 用户已明确要求写入且 dry-run 通过后，去掉 `--dry-run` 执行创建。
5. 再用 `list_props` 确认新属性出现；不要通过数据库查询代替产品接口验证。
