# Research Refactor Plan

## Goal

把 `skills/research/` 重构成：

- an agent-native evidence-aware deep research skill/engine
- agent-led planning with runtime guarantees
- resumable, reviewable, and durable across long-running workflows

核心原则只有一句话：

> The agent owns judgment. The runtime owns guarantees.

换成更直接的工程语言：

- 能用自然语言清楚表达、并且会随着模型变强自然变好的部分，交给 agent
- 必须跨中断、跨重试、跨 provider 保持正确的部分，交给 runtime

这不是“少写代码”，而是把代码放到真正该硬化的地方。

## Why Refactor

当前 `skills/research` 已经有了不错的底座：

- durable session ledger
- evidence and contradictions
- resumable workflow
- `research_brief`
- `plan_versions`
- `delta_plans`
- `gaps[]`
- review / approval flow

但当前主路径仍然带着比较强的 runtime-led planning 倾向：

- fallback planner 仍然经常替 agent 做任务拆解
- prose continuation 仍然隐含大量“脚本推断用户意图”
- `advanceStage()` 虽然已经开始尊重 authored control surface，但还不够彻底
- runtime 仍然容易从 session state 里“发明下一步”，而不是执行 agent 已表达的下一步

这会导致两个问题：

1. soft judgment 被过早固化  
   一旦问题形状有偏差，脚本会把研究方向带歪。

2. skill 无法随模型能力自然升级  
   如果研究判断主要藏在 heuristics 里，LLM 变强也帮不上太多忙。

## Design Target

目标形态不是“更聪明的 planner”，而是一个两层系统：

1. `Case File`
2. `Runtime Executor`

并由 agent 通过 authored artifacts 驱动。

### Layer 1: Case File

`Case File` 是研究案卷，是 durable, inspectable, reviewable state。

它负责保存：

- research intent
- plan history
- evidence ledger
- blockers / gaps
- contradictions
- authored deltas
- execution history
- synthesis state

它不是 runtime 的内部调试对象，而是 agent 之间可交接、可审阅、可继续推进的工作载体。

### Layer 2: Runtime Executor

`Runtime Executor` 是协议层和状态机层。

它负责：

- schema validation
- idempotency
- state transitions
- queue application
- checkpoint / resume
- approval gating
- evidence normalization
- safe merge

它不负责：

- 代替 agent 决定如何拆题
- 代替 agent 判断什么更重要
- 代替 agent 生成研究策略

## Operating Model

新的主路径应该是：

1. agent writes or updates a `research_brief`
2. agent authors an initial `plan`
3. runtime validates and persists the plan
4. runtime executes queued work safely
5. agent reviews emerging evidence and authors a `delta_plan`
6. runtime applies the delta safely and continues execution
7. agent decides when to synthesize, verify, branch, or stop
8. runtime guarantees that every transition is durable and replay-safe

一句话：

- agent decides what the next move should be
- runtime makes sure that move is legal, durable, and replayable

## Hard vs Soft Boundary

这是整个重构最重要的边界。

### Agent-owned soft judgment

以下内容默认由 agent 主导：

- problem framing
- thread decomposition
- claim selection
- source tradeoffs
- what changed and why
- whether a gap is important enough to block
- whether to deepen, branch, verify, or stop
- deliverable shape
- how uncertainty should be communicated

### Runtime-owned hard guarantees

以下内容必须由 runtime 保证：

- stable ids
- schema and shape validation
- state machine legality
- duplication / replay safety
- session persistence
- queue integrity
- approval / freeze / apply semantics
- evidence normalization
- attribution storage
- conflict-safe merges
- backward compatibility

### Decision Rule

每次碰到新逻辑，都先问两句：

1. 这是不是一个可以自然语言描述清楚、而且未来更强模型会做得更好的判断？
2. 这是不是一个一旦出错就会污染 session state、破坏恢复语义、或者引起重复执行的问题？

如果第一个答案是 yes，优先交给 agent。  
如果第二个答案是 yes，优先落到 runtime。

## Primary Control Surfaces

重构后，研究 skill 的主控制面应该明确收敛到 4 个 agent-authored artifacts。

### 1. `research_brief`

它定义任务意图，而不是执行细节。

建议 shape：

```json
{
  "research_brief": {
    "objective": "Find the longest still-operating commercial passenger route.",
    "deliverable": "answer_with_citations",
    "audience": "general",
    "freshness_requirements": {
      "as_of": "2026-03-11",
      "strict": true
    },
    "source_policy": {
      "mode": "prefer_primary",
      "allow_domains": [],
      "preferred_domains": ["airline.com", "airbus.com", "boeing.com"],
      "notes": [
        "Prefer airline schedule, official route announcements, and fleet pages."
      ]
    },
    "non_goals": [
      "Do not optimize for historical longest routes unless they are still operating."
    ],
    "clarification_notes": [
      "Distinguish nonstop from direct-with-stop if needed."
    ]
  }
}
```

新增建议字段：

- `audience`
- `freshness_requirements`
- `non_goals`
- `decision_notes`

### 2. `plan_version`

它定义当前研究结构。

建议约束：

- 必须有稳定 `plan_id`
- 必须能表达 thread priority
- 必须能表达 thread status
- 必须区分 answer-bearing claims 与 exploratory threads

建议扩展：

```json
{
  "plan_id": "route-length-v1",
  "source": "agent_authored",
  "task_shape": "targeted",
  "threads": [
    {
      "thread_id": "thread-longest-route",
      "title": "Current longest route",
      "intent": "Identify the currently longest still-operating passenger route.",
      "priority": "critical",
      "status": "active",
      "claims": [
        {
          "claim_id": "claim-current-longest",
          "text": "The current longest still-operating route is X.",
          "claim_type": "fact",
          "priority": "critical"
        }
      ]
    }
  ]
}
```

### 3. `delta_plan`

这是未来最重要的 artifact。  
它不应该只是 follow-up summary，而应该是：

> what changed, why it matters, and what should happen next

建议 shape：

```json
{
  "delta_plan": {
    "delta_plan_id": "delta-002",
    "summary": "The original framing mixed nonstop and direct routes.",
    "why_now": "We have enough evidence to split the question into two answer paths.",
    "goal_update": "Answer both the longest operating route and the longest nonstop route.",
    "priority_shift": [
      {
        "scope_type": "thread",
        "scope_id": "thread-longest-route",
        "from": "high",
        "to": "critical",
        "reason": "This is the main answer-bearing thread."
      }
    ],
    "gap_updates": [
      {
        "action": "upsert",
        "gap": {
          "kind": "definition_ambiguity",
          "summary": "Need a clear distinction between direct and nonstop.",
          "scope_type": "session",
          "scope_id": "research-123",
          "severity": "high",
          "status": "open",
          "recommended_next_action": "Gather airline and schedule evidence for both interpretations."
        }
      }
    ],
    "thread_actions": [
      {
        "action": "branch",
        "thread_id": "thread-longest-route",
        "new_thread": {
          "title": "Longest nonstop route",
          "intent": "Identify the current longest nonstop passenger route."
        }
      }
    ],
    "claim_actions": [
      {
        "action": "set_priority",
        "claim_id": "claim-current-longest",
        "priority": "critical"
      }
    ],
    "queue_proposals": [
      {
        "kind": "gather_thread",
        "scope_type": "thread",
        "scope_id": "thread-longest-route",
        "reason": "Need stronger primary-source confirmation."
      }
    ]
  }
}
```

新增建议字段：

- `priority_shift`
- `drop_reason`
- `replaced_by`
- `decision_log_entry`

### 4. `gaps[]`

`gaps[]` 应该成为第一公民 blocker surface，而不是辅助文本。

建议统一字段：

- `gap_id`
- `kind`
- `summary`
- `scope_type`
- `scope_id`
- `severity`
- `status`
- `blocking`
- `recommended_next_action`
- `created_by`
- `resolved_by`
- `resolution_note`

建议新增 `blocking: true|false`。  
不是所有 gap 都该阻断 synthesis。我们需要区分：

- blocker gaps
- tracking gaps
- informational gaps

## Runtime Responsibilities After Refactor

runtime 不再默认“策划研究”，而是做下面 6 类事情。

### 1. Validate

校验 authored artifacts 是否合法：

- schema valid
- ids stable
- references exist
- operations legal in current state
- queue proposals point to real targets

### 2. Persist

把所有 authored artifacts 持久化成可审计状态：

- current brief
- current plan
- pending plan
- delta history
- activity history
- gap history

### 3. Compile

runtime 可以做轻量 compile，但不能做重 planning。

允许的 compile 行为：

- expand authored queue proposals into internal work items
- assign ids when missing
- normalize enum values
- derive compatibility views such as `remaining_gaps`

不允许的 compile 行为：

- 自己发明新的 research threads
- 自己重写 claim intent
- 自己决定任务真正要回答什么

### 4. Execute

安全执行 work queue：

- gather
- verify
- synthesize
- handoff
- rejoin

### 5. Freeze / Review / Approve

review gate 必须正式化，而不是“有字段但不是真协议”。

要求：

- `prepare` 只允许生成 pending artifacts
- pending artifacts 不修改 live plan
- `approve` 才能 promote pending artifacts
- freeze 期间不允许 continuation patch 修改 active case file

### 6. Recover

任何时刻都必须能：

- resume after interruption
- rejoin remote results
- avoid duplicate application
- explain current state to another agent

## Planner Refactor Direction

`planner.mjs` 不该继续成长为一个 heuristic brain。  
它应该被拆成两个更明确的角色：

1. `artifact_compiler`
2. `legacy_fallback_planner`

### `artifact_compiler`

负责：

- validate and normalize authored `research_brief`
- validate and normalize authored `plan`
- validate and normalize authored `delta_plan`
- validate structured continuation patches

### `legacy_fallback_planner`

只在以下条件同时满足时启用：

- 没有 `research_brief`
- 没有 current `plan_version`
- 没有 pending `plan_version`
- 没有 `delta_plan`
- 用户只提供了简单自然语言 query

并且它的输出必须被标记为：

- `source: "runtime_fallback"`
- low-authority
- reviewable

原则：

- fallback planner 是 compatibility layer
- 不是系统主脑

## Scoring And Stage Advancement

`scorer.mjs` 和 `advanceStage()` 需要继续去脚本中心化。

### Current Problem

即使已经有 authored surfaces，runtime 仍然可能根据 evidence 状态自行决定：

- 自动 gather 什么
- 自动 verify 什么
- 自动 synthesize 到什么程度

### Target Behavior

`advanceStage()` 应该只做：

- 判断当前有没有合法 authored next step
- 判断当前有没有 blocker
- 判断当前是否满足 stop criteria
- 在没有 authored next step 且也没有 blocker 时，进入 explicit waiting / review-needed state

而不是：

- 自动为 agent 发明新的 research plan

### New Stage Model

建议把 `plan_state` 标准化成：

- `draft`
- `pending_review`
- `approved`
- `executing`
- `awaiting_agent_decision`
- `blocked`
- `ready_to_synthesize`
- `synthesizing`
- `complete`
- `closed`

关键是引入：

- `awaiting_agent_decision`

这是 agent-native 架构的关键状态。  
当 runtime 没有明确的 authored next step 时，不该偷偷帮忙继续规划，而应该明确说：

“现在需要 agent judgment。”

## Evidence Model Upgrades

evidence-aware 不只是“有 citation”，而是要把 evidence 当成 durable reasoning substrate。

建议加强 4 点。

### 1. Claim-to-evidence links remain first-class

每个重要 claim 都应该能回答：

- 它被哪些证据支持
- 被哪些证据反驳
- 这些证据来自哪些域名
- 最近一次验证是什么时候

### 2. Attribution stays inspectable

继续坚持并扩展：

- `anchor_text`
- `matched_sentence`
- `matched_sentence_index`
- `excerpt_method`
- `attribution_confidence`

并在 agent-facing outputs 中保留，而不是只存在 raw JSON。

### 3. Contradictions are durable objects

建议把 contradiction 从文本升级成结构体：

```json
{
  "contradiction_id": "cx-001",
  "claim_id": "claim-current-longest",
  "left_evidence_id": "ev-1",
  "right_evidence_id": "ev-2",
  "conflict_type": "factual_disagreement",
  "summary": "The two sources disagree on whether the route is nonstop.",
  "status": "open",
  "resolution_strategy": "seek_more_primary_or_recent_source"
}
```

### 4. Evidence freshness becomes explicit

建议不要只依赖字符串描述 stale。  
增加明确字段：

- `observed_at`
- `published_at`
- `last_verified_at`
- `freshness_risk`

## Proposed File/Module Direction

不是一次性重写全部，而是逐步把职责抽清楚。

建议目标结构：

```text
skills/research/scripts/core/
  case_file.mjs
  artifact_compiler.mjs
  runtime_executor.mjs
  planner_legacy.mjs
  verifier.mjs
  retrieval.mjs
  synthesizer.mjs
  scorer.mjs
  transitions.mjs
  session_schema.mjs
```

### `case_file.mjs`

负责：

- case file read/write helpers
- snapshot helpers
- append-only history helpers
- merge-safe updates

### `artifact_compiler.mjs`

负责：

- normalize authored artifacts
- fill stable ids if absent
- validate references
- return safe mutations for runtime to apply

### `runtime_executor.mjs`

负责：

- queue application
- work item lifecycle
- durable checkpoints
- replay protection

### `planner_legacy.mjs`

负责：

- minimal fallback decomposition
- only compatibility use

### `transitions.mjs`

负责：

- legal state transitions
- `prepare -> approve -> execute`
- `blocked -> awaiting_agent_decision`
- `ready_to_synthesize -> complete`

## CLI And Workflow Changes

CLI 也要更明确地体现 authored-first。

### Keep

保留：

- `start`
- `prepare`
- `approve`
- `continue`
- `rejoin`
- `status`
- `report`
- `sources`
- `close`

### Add or Strengthen

建议增强以下输入模式：

#### `start --brief-file --plan-file`

显式支持：

- `--brief-file`
- `--plan-file`

让 agent 从一开始就把 authored surfaces 写清楚。

#### `continue --delta-file`

和 `--plan-file` 区分：

- full plan replacement / branch -> `--plan-file`
- incremental next-step mutation -> `--delta-file`

#### `review --session-id`

输出面向 agent 的 review packet：

- current brief
- current plan
- pending plan
- open blockers
- last delta
- recent evidence changes
- unresolved contradictions

这会比通用 `status` 更适合 agent takeover。

## Migration Strategy

建议分 4 个阶段做，不要一次性大爆炸。

### Phase 1: Make authored surfaces primary

目标：

- authored `research_brief` / `plan` / `delta_plan` 成为主路径
- fallback planner 显式降级为 compatibility layer

改动：

- 抽出 `artifact_compiler`
- 缩小 `planner.mjs` 的 planning 责任
- 在 `advanceStage()` 中引入 `awaiting_agent_decision`
- prose continuation 只生成 minimal compatibility patch

验收：

- 没有 authored next step 时，runtime 不再发明复杂研究步骤
- session 明确进入 `awaiting_agent_decision`

### Phase 2: Formalize control plane

目标：

- plan / pending plan / delta / blockers / activity 成为正式协议

改动：

- 强化 `plan_state`
- formal review packet
- typed contradiction objects
- blocker severity and blocking flag

验收：

- 另一个 agent 可以只看 case file 就接手工作

### Phase 3: Strengthen evidence substrate

目标：

- evidence 真正成为 synthesis 和 verification 的 durable basis

改动：

- freshness fields
- stronger claim-evidence links
- contradiction resolution state
- richer findings/source outputs

验收：

- agent 能从 `report` / `sources` 直接看到哪条 claim 还缺什么 evidence

### Phase 4: Legacy isolation and cleanup

目标：

- 把 legacy heuristics 关进明确边界内

改动：

- `planner_legacy.mjs`
- feature flags or explicit fallback path
- compatibility tests

验收：

- 主路径不再依赖 heuristic decomposition

## Testing Strategy

这次重构的测试重点不该只是“能跑完”，而应该测边界。

### Contract tests

覆盖：

- authored plan validation
- delta application legality
- queue proposal validation
- pending vs active isolation
- replay safety

### State machine tests

覆盖：

- `prepare -> approve -> executing`
- `executing -> awaiting_agent_decision`
- `executing -> blocked`
- `ready_to_synthesize -> complete`

### Regression tests

覆盖：

- fallback planner only runs in legacy conditions
- prose continuation does not override authored plan unexpectedly
- tracking gap does not stop synthesis
- blocker gap does stop synthesis

### Real-task fixture tests

增加真实世界题型 fixture：

- current factual question with ambiguity
- policy / docs investigation
- comparison research
- contradiction-heavy question

重点不是复现网页答案，而是验证：

- decomposition 是否由 agent 主导
- runtime 是否只做 guarantees

## Success Criteria

如果重构成功，这个 skill 应该具备以下特征：

1. 对模糊高价值研究题，agent 能明确写出研究意图、研究结构、blockers 和 next step。
2. runtime 不再默认扮演“研究员”，而是扮演“协议层 + 状态机 + ledger keeper”。
3. session 可以跨中断、跨重试、跨 agent 可靠接力。
4. evidence、contradictions、gaps、delta 都是 durable objects，而不是临时文本。
5. 模型能力提升后，skill 会自然变强，因为核心 judgment surface 是 agent-authored。

## Non-Goals

这次重构不追求：

- 把所有研究判断都程序化
- 把 runtime 变成自治 planner
- 通过增加更多 heuristics 解决所有拆题问题
- 一次性重写整个 skill

## Recommended First Cut

如果现在只做最值钱的一刀，我建议是：

1. 抽出 `artifact_compiler`
2. 把当前 `planner.mjs` 明确分裂为 authored compile path 和 legacy fallback path
3. 在 `advanceStage()` 引入正式的 `awaiting_agent_decision`
4. 让 prose continuation 退化成 minimal compatibility mode

这是最有杠杆的一步，因为它会直接把系统从：

- runtime-led planning with agent overrides

推向：

- agent-led planning with runtime guarantees

## Final Principle

这个 skill 的最终竞争力，不在于它能写出多复杂的 heuristics，  
而在于它能不能为越来越强的 agent 提供：

- durable memory
- explicit evidence substrate
- safe transitions
- reviewable control surfaces

最好的研究 runtime，不是最会替 agent 思考的 runtime。  
最好的研究 runtime，是最会让 agent 的判断可靠落地的 runtime。
