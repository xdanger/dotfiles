/* global process */

import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultAdapters } from "../../core/providers.mjs";

const runLive = process.env.RUN_LIVE_PROVIDER_TESTS === "1";

test("live provider contract smoke", { skip: !runLive }, async () => {
  const adapters = createDefaultAdapters();

  const search = adapters.runTavilySearch({
    query: "OpenAI API pricing",
    depth: "basic",
    domains: [],
    timeRange: null,
    country: null,
  });
  assert.ok(search.results.length > 0);

  const extract = adapters.runTavilyExtract({
    urls: [search.results[0].url],
    query: "OpenAI API pricing",
  });
  assert.ok(extract.results.length > 0);

  const map = adapters.runTavilyMap({
    url: "https://openai.com/api/",
    instructions: "Find pricing and docs pages",
    depth: "quick",
  });
  assert.ok(map.results.length > 0);
});
