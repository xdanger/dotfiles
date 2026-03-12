import assert from "node:assert/strict";
import test from "node:test";

import { inferClaimMatch } from "../../core/retrieval.mjs";

test("inferClaimMatch marks direct positive evidence as support", () => {
  const claim = { text: "Product X is SOC 2 certified" };
  const result = inferClaimMatch(
    claim,
    "The official security page states that Product X is SOC 2 certified and available for enterprise use.",
    "Product X SOC 2 official evidence",
  );

  assert.equal(result.stance, "support");
  assert.match(result.whyMatched, /product|certified/iu);
  assert.equal(result.attribution.excerpt_method, "sentence_token_match");
  assert.match(result.attribution.anchor_text, /SOC 2 certified/iu);
  assert.ok(result.attribution.attribution_confidence >= 0.5);
});

test("inferClaimMatch marks local negative evidence as oppose", () => {
  const claim = { text: "Product X is SOC 2 certified" };
  const result = inferClaimMatch(
    claim,
    "The official compliance page says Product X is not SOC 2 certified at this time.",
    "Product X SOC 2 official evidence",
  );

  assert.equal(result.stance, "oppose");
  assert.match(result.attribution.anchor_text, /not SOC 2 certified/iu);
});

test("inferClaimMatch falls back to context when the claim is not locally grounded", () => {
  const claim = { text: "Product X is SOC 2 certified" };
  const result = inferClaimMatch(
    claim,
    "This page describes pricing tiers and API limits, but not compliance.",
    "Product X official evidence",
  );

  assert.equal(result.stance, "context");
  assert.ok(result.attribution.attribution_confidence <= 0.3);
});

test("inferClaimMatch requires concrete endpoint detail for endpoint-style claims", () => {
  const claim = {
    text: "Official sources name the endpoint, API surface, or mechanism needed to answer: Does OpenAI expose deep research in the API, and if so through which endpoint.",
  };
  const vague = inferClaimMatch(
    claim,
    "This guide discusses OpenAI-compatible endpoints and remote provider settings.",
    "OpenAI deep research endpoint official docs",
  );
  const concrete = inferClaimMatch(
    claim,
    "OpenAI exposes deep research in the API through the Responses API.",
    "OpenAI deep research endpoint official docs",
  );

  assert.equal(vague.stance, "context");
  assert.equal(concrete.stance, "support");
});
