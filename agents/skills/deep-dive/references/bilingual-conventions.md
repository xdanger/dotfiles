# Bilingual Conventions (Chinese / English)

These conventions apply when the user is learning in a second language and wants the deep-dive to support that. The running example throughout is a native Chinese speaker learning English — adapt the specifics to the user's actual language pair. There are three patterns; this file pins down the exact format so the skill produces consistent output.

## The three patterns

### 1. Rephrase the user's message

At the **start** of every response, restate the user's message in natural idiomatic English, in a blockquote, so the user can learn from the improvement.

```
> [Idiomatic English rephrase of the user's message here]
```

Rules:

- Keep the rephrase **faithful** to what the user actually asked. Don't expand scope, don't add interpretations.
- Aim for what a native English speaker would actually say, not a literal translation.
- If the user's message is already in idiomatic English, you can still rephrase if there's a noticeably better way; otherwise reflect it back as-is.
- Skip the rephrase only if the user's message is purely numeric/symbolic (e.g., "1, 2, 3" or a single emoji).

### 2. STEM and technical terminology — first-mention pairing

When you introduce a technical term (math, physics, CS, biology, engineering, finance), give both languages on first mention:

```
反向传播 (backpropagation) ...
gradient descent (梯度下降) ...
```

Rules:

- Order: doesn't matter, but be consistent within a paragraph.
- First mention: both languages, in parens.
- Subsequent mentions in the same response: either language is fine — pick whichever flows better in the surrounding sentence.
- If the field uses an acronym (CNN, GPU, REST), keep the acronym and gloss it once: "CNN (convolutional neural network, 卷积神经网络)".
- Don't over-pair. Common terms like "computer", "data", "code" don't need pairing.

### 3. Uncommon English vocabulary — Chinese gloss

When you use an English word that's not in the everyday A2/B1 range, append a brief Chinese gloss in parens. Threshold: roughly C1+ academic vocabulary, idioms, or domain jargon outside the topic being taught.

```
This idea is a bit of a chimera (奇美拉, 嵌合体).
The argument is tendentious (有偏向的) — let me explain.
```

Rules:

- One or two Chinese characters / a short phrase. Don't write a full definition; the goal is recognition speed, not a dictionary entry.
- Skip the gloss if the word is the topic being taught (e.g., when teaching about "entropy" you don't gloss "entropy" every time — that's the term you're defining).
- Skip if the word is already a loanword in Chinese tech-speak (e.g., "API", "SDK", "framework" don't need glosses for an engineering audience).

## Code, math, identifiers — never translate

Don't translate code, mathematical symbols, file paths, library names, function names, or proper nouns. They stay verbatim.

## Mixed paragraphs

Mixing Chinese and English freely within a paragraph is fine and matches how many bilingual speakers naturally think. Default to Chinese for narrative and explanation; switch to English for technical terms, quotes, and proper nouns.

```
我们看一下 attention mechanism (注意力机制) 是怎么算的。给定 query Q、key K、value V，
公式是 softmax(QK^T / √d_k) V。这里 √d_k 是为了把 dot product 的方差控制住,
避免 softmax 进入 saturated (饱和) 区域。
```

## What this skill specifically should NOT do

- **Don't write a Chinese-only response.** Even if the topic is purely Chinese-language (a Tang dynasty poem), include English terms for the technical concepts you reach for (poetics, prosody, scansion).
- **Don't write an English-only response.** Even for code-heavy topics, the surrounding explanation should be in Chinese with English terms paired in.
- **Don't gloss every word.** Glossing common vocabulary is patronizing and slows reading. Threshold is "would a literate Chinese speaker who's at B2 English have to stop and look this up?" — only then gloss.

## Quick self-check

Before sending, scan the response for:

1. Is the rephrase blockquote at the top? ✓
2. First-mention STEM terms paired? ✓
3. Uncommon English words glossed? ✓
4. No over-glossing of common words? ✓
