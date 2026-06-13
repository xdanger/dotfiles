# Memory Hooks — Patterns & Traps

This reference exists because **a bad memory hook is worse than no memory hook**. A vivid analogy that uses the wrong mechanism teaches a false model, and the learner then has to unlearn it later. Be picky.

## The mechanism-accuracy test

Before you commit to an analogy, ask: **does the source share the actual causal mechanism with the target, or does it just share the visible outcome?**

- ✅ "Backpropagation is like water reverse-flowing through a pipe network" — mechanism: linear superposition of contributions along edges. Pipes share that mechanism. Good.
- ❌ "Lift, thrust, and buoyancy all make things go up" — these share the _outcome_ (upward motion) but use three entirely different mechanisms (pressure differential from airflow, momentum exchange, displaced fluid weight). Pooling them teaches that "up = one thing", which is wrong.
- ❌ "DNA is a blueprint" — common but actively misleading. A blueprint is a static spatial map read once; DNA is closer to a recipe (sequential operations) or a computer program (with conditionals, loops, regulatory layers). The "blueprint" hook makes it harder to understand gene regulation later.

When you can't find a clean mechanism match, **say so**: "I don't have a clean analogy that captures this — here's the mechanism directly, and here's the closest approximation, with these caveats."

## Hook types and when to use them

### Analogies — for mechanisms

Use when the target has a familiar mechanical twin. The best analogies map structure to structure: source-node ↔ target-node, source-edge ↔ target-edge.

**Worked example — TCP congestion control as a freeway on-ramp meter:**

- Sender ↔ on-ramp meter; receiver ↔ downstream traffic; ACKs ↔ "I made it" feedback; congestion window ↔ how many cars released per cycle. Mechanism shared: closed-loop control responding to delayed feedback. ✓

### Mnemonics / 口诀 — for ordered lists or named entities

Use when the content is an ordered or enumerated set with no internal logic to derive from. Don't force a mnemonic on something that _does_ have internal logic — derivable structure beats memorized acronym.

**Good** — OSI 7 layers: "Please Do Not Throw Sausage Pizza Away" (Physical, Data link, Network, Transport, Session, Presentation, Application). The layers don't have a derivable order; mnemonic earns its keep.

**Bad** — using a mnemonic for the steps of long division. Long division _has_ internal logic; memorize the logic, not an acronym.

### Stories — for processes that unfold over time

Use when the concept _is_ a sequence of events with causes, or when the historical invention story illuminates the mechanism. Stories also satisfy a learner's appetite for historical context and the human story behind an idea ("历史背景 + 人物故事").

**Worked example — why TCP looks the way it does:**
Tell the ARPANET story: the early '70s assumption was "the network is reliable, hosts are dumb"; Cerf and Kahn flipped it to "network is dumb, hosts are smart" (end-to-end principle), because the network was about to become a confederation of unreliable subnetworks. That's why TCP does retransmission at the endpoints, not in the middle. The story isn't decoration — it explains the architecture.

### Concrete numbers — for scales that defy intuition

Use when the point is the _magnitude_ itself, and abstract numbers don't stick.

**Worked example — CPU vs neuron timescales:**
A neuron fires roughly 200 times/sec (5 ms refractory). A modern CPU clock is ~3 × 10⁹ Hz. That's 7 orders of magnitude — the CPU does in 1 second what your neuron does in ~6 months. (This anchors why "brain-inspired computing" doesn't mean "mimic timing".)

## Common traps

**Trap 1 — Anthropomorphizing.** "The molecule _wants_ to be at lower energy." It's a shorthand, but it builds wrong intuition (molecules don't have preferences; ensembles populate states proportional to Boltzmann weights). Use sparingly and flag when you do.

**Trap 2 — Loading too much onto one analogy.** A good analogy maps one mechanism well. Trying to make the same analogy explain _also_ energy, _also_ parallelism, _also_ error handling usually fails. Use multiple analogies, each tight, rather than one stretched.

**Trap 3 — Cultural opacity.** A baseball analogy is opaque to someone who doesn't follow baseball. Default to physical-world analogies (water, gears, traffic, cooking) that don't require culture-specific knowledge. If you use a culture-specific one, pick from contexts the user is likely to know (their cultural background, their profession, their domain).

**Trap 4 — The "magic" hook.** "It's like magic — you put data in and answers come out." This is a refusal to teach. If you find yourself reaching for "magic", the model isn't there yet — go back to mechanism.

## Self-check before you ship the hook

Three questions:

1. **Does it share the actual mechanism?** (If you have to caveat in 3 places, no.)
2. **Could a learner predict a new situation using this hook?** (If the hook works only for the example you gave it, it's decoration not understanding.)
3. **Does it teach anything wrong that has to be unlearned later?** (Blueprint-for-DNA fails this; calculus-as-rate fails it less.)

If yes / yes / no — ship it. Otherwise iterate.
