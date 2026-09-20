# TapDB 看板模板路由

当用户只说「做一个 TapDB 看板 / 核心数据看板 / 运营看板 / dashboard」，但没有给具体报表清单、指标或布局时，不要一次性读取所有游戏类型模板。

## 路由流程

1. 先判断游戏类型：基于项目名、remark、tags、已同步的 `.tapdb/skills/<project_id>/` 上下文、现有看板/报表命名、事件名和属性名推断。
2. 判断后只读取对应模板文件：`references/dashboard_templates/<type>.md`。
3. 无法可靠判断时，只读取 `references/dashboard_templates/generic.md`，并向用户给出最可能的 2-3 个类型让其确认。
4. 创建前按 `dashboard_guide.md`、`report_api.md` 和 `describe report_save`
   查询 folder、event、quota、property 等元数据；不能猜 eventId、属性名或 analysis。

## 游戏类型到模板文件映射

| 游戏类型 | 模板文件 |
|---|---|
| 通用/无法判断 | `dashboard_templates/generic.md` |
| 休闲/超休闲/轻度益智 | `dashboard_templates/casual.md` |
| 消除/三消/关卡制 Puzzle | `dashboard_templates/match_puzzle.md` |
| 放置/Idle/Merge/轻中度养成 | `dashboard_templates/idle_merge.md` |
| 模拟经营/Tycoon/Farm/城建 | `dashboard_templates/simulation_tycoon.md` |
| RPG/ARPG/MMORPG | `dashboard_templates/rpg.md` |
| 卡牌/二游/Gacha/CCG | `dashboard_templates/gacha_card.md` |
| SLG/4X/战争策略 | `dashboard_templates/slg_4x.md` |
| MOBA/FPS/TPS/Battle Royale/动作竞技 | `dashboard_templates/competitive_action.md` |
| 体育/竞速/音游 | `dashboard_templates/sports_racing_rhythm.md` |
| 沙盒/UGC/创造类 | `dashboard_templates/sandbox_ugc.md` |
| 社交/派对/语音房/轻社交 | `dashboard_templates/social_party.md` |
| Casino/棋牌/博彩模拟/牌桌类 | `dashboard_templates/casino_board.md` |
| 塔防/Roguelike/自走棋/策略关卡 | `dashboard_templates/td_roguelike_autochess.md` |
| 教育/儿童/严肃游戏 | `dashboard_templates/education_kids.md` |

## 通用落地 Prompt 结构

```text
为 TapDB 项目「{project_name}」制作「{game_type} 核心运营看板」。
目标：用户未给出具体报表细节，请按已读取的 {game_type} 模板生成并创建看板。
时间范围：默认最近 30 天；首屏 KPI 默认今日/昨日或最近 7 天。
维度：默认按渠道/媒体、国家/地区、平台、版本拆分；玩法相关维度按项目事件元数据可用性选择。
看板结构：
1) 首屏 KPI 数值卡
2) 获客/增长
3) 活跃/留存
4) 变现（IAP/IAA/Hybrid 按项目能力）
5) 核心玩法/漏斗/经济
6) 性能与异常
执行要求：
- 创建前先读取 dashboard_guide.md、report_api.md，并运行 describe report_save。
- 先查询 folder、event、quota、property 元数据；不能猜 eventId/属性名/analysis。
- 若关键事件缺失，先创建可落地的标准指标卡片，并列出未落地指标及所需埋点。
- 使用 12 列网格：首屏 4 个 w=3 数值卡；趋势/分布 w=6；关键漏斗/总览 w=12。
- 创建后运行 dashboard_analysis 校验每张报表，并返回看板链接、报表清单、未覆盖项。
```
