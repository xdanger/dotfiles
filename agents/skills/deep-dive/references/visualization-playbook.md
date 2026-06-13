# Visualization Playbook

Reference material for picking the right visualization tool. The SKILL.md body already lists the tools and their primary uses; **consult this file only when you're on the boundary between two tools** and need the decision matrix, the worked decisions, or the anti-patterns.

A visual must carry information **more efficiently** than prose. If a sentence does the job, don't draw.

## Decision matrix

| Content shape                                                                                                                                         | Use                             | Tier       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| Relationships / hierarchy / process flow / state machine / sequence                                                                                   | **Mermaid**                     | built-in   |
| Comparison across ≥3 items × ≥3 attributes                                                                                                            | **Markdown table**              | built-in   |
| Magnitude / scale that defies intuition                                                                                                               | **Number callout + comparison** | built-in   |
| Real-world product / physical object                                                                                                                  | **Image** (search or generate)  | built-in   |
| Single-panel interactive demo, one slider → one effect                                                                                                | **`show_widget`**               | built-in   |
| Static SVG (force diagram, geometry, anatomy)                                                                                                         | **`show_widget`** with SVG      | built-in   |
| Real data → publication-quality chart                                                                                                                 | **`data:create-viz`**           | skill      |
| **Dynamic system / emergence / "watch it run"** (cellular automata, chaos, percolation, flocking, random processes, gradient descent on loss surface) | **`algorithmic-art`** (p5.js)   | skill      |
| Printable concept poster / cheat sheet (one static image)                                                                                             | **`canvas-design`**             | skill      |
| Complex multi-panel interactive demo with state and real components                                                                                   | **`web-artifacts-builder`**     | skill      |
| Artifact the user will re-open across sessions / refresh on demand                                                                                    | **`create_artifact`**           | persistent |

## 9-step triage

When in doubt, walk down this list and stop at the first match:

1. **Is one sentence enough?** → write the sentence. No visual.
2. **Relationship / process I can draw with ≤ 12 nodes?** → Mermaid.
3. **Single static image (force diagram, geometry, anatomy)?** → SVG via `show_widget`.
4. **Concept fundamentally dynamic — emerges over time / from rules / from randomness?** → `algorithmic-art`.
5. **Real data + real chart needed?** → `data:create-viz`.
6. **One slider → one visual?** → interactive `show_widget`.
7. **Multiple panels, lots of state, real components?** → `web-artifacts-builder`.
8. **Printable cheat sheet / poster?** → `canvas-design`.
9. **Should this outlive the chat turn?** → wrap in `create_artifact`.

## Worked decisions (representative)

**"Why does percolation have a sharp phase transition?"**
→ `algorithmic-art` with a slider for occupation probability _p_, N×N grid with flood-fill coloring connected clusters. The user moves _p_ from 0.4 → 0.7 and **sees** the giant cluster pop into existence around p_c ≈ 0.5927. This is the canonical p5 case — no prose can deliver that "aha".

**"Explain how a transformer works."**
→ Mermaid `flowchart LR` for the token → embedding → [attention → add&norm → FFN] × N stack. Second Mermaid for Q/K/V. No interactivity needed — the architecture is static.

**"What does the normal distribution look like as σ changes?"**
→ `show_widget` with one slider, redrawing the PDF. Fits a single panel; perfect fit.

**"Compare Postgres, MySQL, and SQLite for a small read-heavy app."**
→ Markdown table — 3 items × 6 attributes.

**"Give me a one-pager I can print covering organic chemistry functional groups."**
→ `canvas-design` — printable .png/.pdf, the whole point is one static image.

## Anti-patterns

- **Pie charts for >5 slices** — humans can't compare angles. Use a bar chart.
- **3D charts** — almost never warranted; the third dimension distorts data.
- **Color-only encoding** — pair with shape/pattern/label for accessibility.
- **A diagram that just restates the bullet list above it** — pick one.
- **Decoration emoji** — they add noise, not information; skip them.
- **Reaching for `web-artifacts-builder` when `show_widget` would do** — heavier and slower for the same outcome.
- **`create_artifact` for one-off explanations** — persistence has overhead; only worth it when re-opens are likely.
- **Animating something static** — `algorithmic-art` is great when dynamics carry information; otherwise animation just delays comprehension.

## Tool-specific notes (compact)

- **Mermaid**: ≤ 12 nodes per diagram; split if more. Always set `direction` (LR for process, TD for hierarchy). One accent color, not rainbow.
- **`show_widget`**: single self-contained HTML/SVG. If you need multiple coordinated panels, upgrade to `web-artifacts-builder`.
- **`algorithmic-art`**: STEM sweet spots — cellular automata (Game of Life, Rule 30), chaos (Lorenz, double pendulum, logistic map), emergence (boids, Vicsek), phase transitions (percolation, Ising, forest fire), random processes (random walks, Galton board), optimization (simulated annealing, gradient descent), neural dynamics, wave/fluid sim.
- **`canvas-design`**: outputs .png/.pdf files — deliverable, not inline visual.
- **`create_artifact`**: HTML in browser only. Can embed Mermaid, Chart.js, Grid.js. Compose with other tools rather than replacing them.
