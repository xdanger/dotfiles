---
name: deep-dive
description: Explain unfamiliar concepts through structured teaching when the user wants a working understanding. Match the requested depth; brief explanations do not require a full lesson. Exclude factual lookups, syntax help, and routine coding or writing tasks.
---

# Deep-Dive Skill

This skill turns an "I want to understand X" request into a structured deep-dive. It targets a curious learner who wants a real working model of a concept, not just an answer — and it leans on whatever surface preferences the user has already set (language, voice, appetite for visualization). Your job here is the **method underneath**: the skill adds the four things surface preferences alone can't deliver — prerequisite mapping, layered exposition, mechanism-accurate memory hooks, and a "where to go next" trailhead.

> If you're answering a quick factual question or helping with a writing/coding task, this skill is the wrong tool. Use it only when the user is asking to _understand_ something they don't yet have a working model of.

## Why this skill exists

A learner usually can't name their own blind spots — "you don't know what you don't know." So the most valuable thing you can do is **make the unknown unknowns visible** — show the territory before walking through it, surface the prerequisites that other explanations silently assume, and connect the concept being asked about to neighbors the user might not realize were relevant.

Three principles run underneath everything below:

1. **Map before walk.** A learner who can see the territory recovers faster from confusion than one who can only see the next step. Sketch the landscape when it helps orient the learner.
2. **Mechanism > surface similarity.** An analogy that _looks_ like the target but uses a different mechanism teaches a false model. If you reach for an analogy, verify it shares the actual causal mechanism, not just the visual outcome. (Example: lift, thrust, and buoyancy all "make things go up" but are entirely different mechanisms; don't pool them.)
3. **Leave a trail, not a destination.** Offer next steps when the user wants to continue learning.

## The workflow

Choose the following elements according to the learning goal and requested depth; none is a mandatory section. A short explanation can be complete with a clear mechanism and one useful example. Order and weight depend on the topic. A history question might foreground the timeline; a physics derivation might foreground the mechanism; a CS framework might foreground hands-on use. Use judgment.

### 1. The big picture (where does this sit?)

When orientation is useful, briefly situate the concept. Possible questions include:

- **What family does it belong to?** ("Diffusion models are a class of generative models, alongside GANs and VAEs.")
- **What problem was it invented to solve?** ("Diffusion models came from modeling generation as the reverse of a gradual noising process — an idea rooted in nonequilibrium thermodynamics, Sohl-Dickstein et al. 2015 — not as a fix for GANs.")
- **Who and when?** Name the key people and the era — historical context and the human story (人物故事) make a concept stick. Include historical detail only when it helps explain the concept.

If the topic is purely procedural ("how do I use Polars"), the big-picture can be one sentence on what makes Polars distinct from pandas and why someone built it that way.

### 2. Prerequisite check (knowledge map)

Infer the learner's background from context and proceed at a reasonable level, briefly filling essential gaps inline. Ask about prerequisites only when the answer would materially change the explanation and cannot be inferred. Do not block a useful first explanation on a knowledge questionnaire.

Example when calibration is necessary:

> 要把这块讲清楚，最好你已经熟悉：
>
> - **A** — 你之前 ... 熟吗？
> - **B** — 这是 ... 的概念，熟吗？
> - **C** — ... 熟吗？
>
> 哪个不熟我先补；都熟我就直接讲主线。

If the topic genuinely has no prerequisites, skip this step — don't manufacture them.

### 3. Main exposition (layered)

For a deeper explanation, these layers often help; adapt their order and depth:

- **Intuition** — the cleanest mental model. Use one sentence, then unpack it. No formalism yet. ("Backpropagation is just the chain rule applied to a computation graph, working right-to-left.")
- **Mechanism** — _how_ it actually works, with enough detail to predict its behavior in a new situation. This is where the formalism, equations, code, or step-by-step process lives.
- **Edge / limits** — where does it break, what doesn't it cover, what's the next concept that handles the gap?

If the user is learning in a second language, apply the bilingual convention throughout: pair technical terms across both languages on first mention (e.g., "梯度下降 (gradient descent)") and gloss uncommon vocabulary. The reference's running example is a native Chinese speaker learning English — adapt it to the user's actual language pair. For details on format, see [references/bilingual-conventions.md](references/bilingual-conventions.md).

### 4. Memory hooks

Use an analogy, mnemonic, or story when it makes the core mechanism easier to understand. **Verify it shares the actual mechanism** — if you have to caveat the analogy in three places to make it correct, find a better one.

Memory hooks come in flavors; pick the one that fits the concept's shape:

- **Analogies** — for mechanisms (use when the target has a familiar mechanical twin)
- **Mnemonics / 口诀** — for ordered lists or named entities (the planets, the layers of OSI)
- **Stories** — for processes that unfold over time (the invention of calculus, why TCP looks the way it does)
- **Concrete numbers** — for scales that defy intuition (a neuron fires ~200 times/sec; a CPU clock is ~3×10⁹/sec — 7 orders of magnitude)

See [references/memory-hooks-patterns.md](references/memory-hooks-patterns.md) for worked examples and common traps.

### 5. Visualization

Pick the right visual for the content. A visual must carry information you _can't_ convey as efficiently in prose — if a sentence does the job, don't draw. Quick rules, in roughly increasing cost. The always-available primitives are **Mermaid**, **static SVG**, **Markdown tables**, and prose; the back-ticked entries below (`show_widget`, `data:create-viz`, `algorithmic-art`, `canvas-design`, `web-artifacts-builder`, `create_artifact`) name **optional artifact/widget capabilities that depend on the host environment** — use them when available, and fall back to a primitive (or describe-then-link) when not.

- **Mermaid** — relationships, hierarchies, state machines, processes
- **`show_widget`** _(if available)_ — single-panel interactive demo (one slider → one effect), or static SVG (force diagrams, geometry, anatomy); fall back to static SVG/Mermaid
- **Markdown table** — comparing 3+ things across 3+ axes
- **Number callout + comparison** — when magnitude itself is the point
- **`data:create-viz`** _(if available)_ — real data → publication-quality chart
- **`algorithmic-art` (p5.js)** _(if available)_ — **dynamic systems**: emergence, chaos, percolation, cellular automata, flocking, gradient descent on a loss surface. The single biggest unlock for STEM teaching; reach for it whenever the concept IS evolution / local rules / randomness.
- **`canvas-design`** _(if available)_ — printable concept poster / cheat sheet
- **`web-artifacts-builder`** _(if available)_ — complex multi-panel interactive demo with state (overkill for single widgets)
- **`create_artifact`** _(if available)_ — when the artifact should outlive the chat turn

For products or physical objects, use an image only when visual appearance or spatial structure matters to the explanation.

These rules cover the vast majority of cases. Only consult [references/visualization-playbook.md](references/visualization-playbook.md) when you're on the boundary between two tools — it has the full decision matrix, a 9-step triage, and worked decisions for edge cases.

### 6. Connect the dots

When useful, briefly explain what _adjacent_ concepts this unlocks or relates to. Where does this fit in the broader map? This is the "I don't know what I don't know" remedy — surface 2–4 neighbors so the user sees what's nearby even if they don't pursue them now.

Example when calibration is necessary:

> 这块往外延伸有几条线：
>
> - 想理解 X 怎么演化到 Y，下一步看 ...
> - 同一时代的另一条思路是 ...
> - 工程上的对应实现是 ...

### 7. Trailhead (next steps)

For a learner seeking further study, offer concrete next steps they can actually take:

- **Read** — a specific paper, chapter, blog post, or textbook section (use real, verifiable references; if you're not sure, say so)
- **Try** — a small experiment, code snippet, calculation, or thought experiment that tests understanding
- **Watch / interact** — a known good video, demo, or sandbox if one exists

Two to four items is plenty. Don't pad. If you cite something, the citation must be checkable.

## What to skip

Stop when the requested explanation is complete. Do not lengthen it to fill this workflow. Skip:

- Redundant recaps beyond any user-requested rephrase
- Hedging like "this is a great question" or "as you may know"
- Restating the same thing in two different ways for emphasis
- "Hopefully this helps! Let me know if you have any questions!" closers — they add nothing; cut them
- Markdown overhead that doesn't add structure (don't bold every other word; don't bullet single sentences)

## Format choices

- **Headings**: use H2 (`##`) for the main sections, H3 (`###`) only when a section has clearly separable subsections. Don't nest deeper.
- **Bilingual STEM terms**: first mention with both languages — `反向传播 (backpropagation)` — subsequent mentions can use either.
- **Uncommon English words**: brief Chinese in parens — `it's a chimera (奇美拉, 嵌合体) of two architectures`.
- **Code / math**: use code blocks for code, LaTeX (`$...$` inline, `$$...$$` block) for math. Don't smuggle math into prose with unicode hacks.
- **Mermaid blocks**: render with ` ```mermaid ` fence. Keep nodes to ≤ 12; if you need more, the concept probably needs two diagrams.

## A worked outline (not a template, an example)

For "what is backpropagation?", a response using this skill might look like:

> **大图**：backpropagation 是训练神经网络的标准算法，1986 年 Rumelhart/Hinton/Williams 那篇论文让它出圈 …
>
> **前置**：你对（1）链式法则 chain rule，（2）梯度下降 gradient descent，（3）computation graph 这三个概念熟吗？哪个不熟我先补 …
>
> **主线（分层）**：
>
> - _直觉_：误差从输出层向输入层"倒着流"，每一层告诉前一层"你那里要往哪个方向调多少" …
> - _机制_：[derivation with notation] …
> - _边界_：vanishing/exploding gradient 在深网络里会让 backprop 失效 → 这是 ResNet/BatchNorm 要解决的问题 …
>
> **可视化**：[一个 Mermaid 图展示 forward pass vs backward pass 的方向]
>
> **记忆 hook**：把 computation graph 想成水管系统 — forward 是水从源头流到出口，backward 是从出口反向追溯"每根水管贡献了多少压力" …（验证：这个类比共享"线性叠加"机制 ✓）
>
> **顺藤摸瓜**：往前看 → automatic differentiation 是 backprop 的一般化；横着看 → forward-mode AD 是反过来的；往后看 → backpropagation through time 把它扩展到 RNN …
>
> **trailhead**：
>
> - 读：Goodfellow《Deep Learning》第 6.5 节
> - 试：手算一个 2 层 MLP 在一个 sample 上的 backward pass，验证你的导数和 PyTorch autograd 一致
> - 看：3Blue1Brown 的 backpropagation 那期视频

That's the shape. Adjust ruthlessly for the topic at hand.

## Reference files

- [references/memory-hooks-patterns.md](references/memory-hooks-patterns.md) — analogies, mnemonics, stories: when to use which, and what counts as "mechanism-accurate"
- [references/visualization-playbook.md](references/visualization-playbook.md) — decision matrix for Mermaid vs widget vs SVG vs table, with worked examples
- [references/bilingual-conventions.md](references/bilingual-conventions.md) — format rules for Chinese/English term pairing and rephrase blocks
