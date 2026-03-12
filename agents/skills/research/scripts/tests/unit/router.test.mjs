import assert from "node:assert/strict";
import test from "node:test";

import {
  braveGogglesFromPolicy,
  chooseManusProfile,
  classifyTaskShape,
  depthProfile,
  shouldUseCrawl,
} from "../../core/router.mjs";

test("classifyTaskShape distinguishes broad verification site and async", () => {
  assert.equal(classifyTaskShape("Research the AI coding agent landscape in 2026"), "broad");
  assert.equal(classifyTaskShape("What are the top AI coding agents in 2026?"), "broad");
  assert.equal(classifyTaskShape("What is OpenAI deep research?"), "broad");
  assert.equal(classifyTaskShape("How does OpenAI deep research work?"), "broad");
  assert.equal(
    classifyTaskShape("Is product X SOC 2 certified, and what is the evidence?"),
    "verification",
  );
  assert.equal(
    classifyTaskShape("Does OpenAI expose deep research in the API, and how is it documented?"),
    "verification",
  );
  assert.equal(
    classifyTaskShape("Audit this docs site for auth coverage: https://example.com"),
    "site",
  );
  assert.equal(
    classifyTaskShape("Research this market and deliver a CSV with top vendors"),
    "async",
  );
});

test("depthProfile meaningfully differs across quick standard deep", () => {
  assert.equal(depthProfile("quick").searchDepth, "fast");
  assert.equal(depthProfile("standard").searchFanout, 4);
  assert.equal(depthProfile("deep").extractLimit, 8);
});

test("chooseManusProfile uses lite regular and max strategically", () => {
  assert.equal(
    chooseManusProfile("Explore connectors briefly", "quick", "async"),
    "manus-1.6-lite",
  );
  assert.equal(
    chooseManusProfile("Deliver a CSV market report", "standard", "async"),
    "manus-1.6",
  );
  assert.equal(
    chooseManusProfile("Produce a max comprehensive artifact-heavy report", "deep", "async"),
    "manus-1.6-max",
  );
});

test("braveGogglesFromPolicy generates correct Goggles syntax", () => {
  assert.equal(braveGogglesFromPolicy(), undefined);
  assert.equal(braveGogglesFromPolicy({}), undefined);
  assert.equal(braveGogglesFromPolicy({ preferred_domains: [] }), undefined);

  assert.equal(
    braveGogglesFromPolicy({ preferred_domains: ["docs.python.org", "mdn.io"] }),
    "$site=docs.python.org,boost=5\n$site=mdn.io,boost=5",
  );

  assert.equal(
    braveGogglesFromPolicy({ allow_domains: ["example.com"] }),
    "$discard\n$site=example.com",
  );

  assert.equal(
    braveGogglesFromPolicy({
      allow_domains: ["example.com"],
      preferred_domains: ["other.com"],
    }),
    "$discard\n$site=example.com",
    "allow_domains takes precedence over preferred_domains",
  );
});

test("shouldUseCrawl only enables audit-like site tasks", () => {
  assert.equal(
    shouldUseCrawl({
      task_shape: "site",
      goal: "Audit this docs site for policy coverage",
    }),
    true,
  );
  assert.equal(
    shouldUseCrawl({
      task_shape: "site",
      goal: "Read the auth docs",
    }),
    false,
  );
});
