import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBraveContextResponse,
  validateGeminiGroundingResponse,
  validateManusCreateTaskResponse,
  validateTavilyExtractResponse,
  validateTavilyMapResponse,
  validateTavilyResearchResponse,
  validateTavilySearchResponse,
} from "../../core/providers.mjs";
import {
  braveContextSample,
  geminiGroundingSample,
  manusCreateTaskSample,
  tavilyExtractSample,
  tavilyMapSample,
  tavilyResearchSample,
  tavilySearchSample,
} from "../fixtures/provider_contract_samples.mjs";

test("validateTavilySearchResponse accepts current live-like search payload", () => {
  const result = validateTavilySearchResponse(tavilySearchSample);

  assert.equal(result.results.length, 2);
  assert.equal(result.results[1].url, "https://openai.com/api/pricing/");
});

test("validateTavilyExtractResponse accepts current live-like extract payload", () => {
  const result = validateTavilyExtractResponse(tavilyExtractSample);

  assert.equal(result.results.length, 1);
  assert.match(result.results[0].raw_content, /GPT-5\.4/u);
});

test("validateTavilyMapResponse accepts current live-like map payload", () => {
  const result = validateTavilyMapResponse(tavilyMapSample);

  assert.equal(result.results.length, 3);
  assert.ok(result.results[0].includes("/pricing"));
});

test("validateTavilyResearchResponse accepts planning-style research payload", () => {
  const result = validateTavilyResearchResponse(tavilyResearchSample);

  assert.equal(result.status, "completed");
  assert.match(result.content, /retrieval augmented generation/i);
});

test("validateBraveContextResponse accepts LLM Context payload", () => {
  const result = validateBraveContextResponse(braveContextSample);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, "https://example.com/page");
  assert.equal(result.results[0].snippets.length, 2);
  assert.equal(result.results[0].hostname, "example.com");
  assert.equal(result.results[0].published_date, "2025-01-15");
});

test("validateGeminiGroundingResponse accepts grounding payload", () => {
  const result = validateGeminiGroundingResponse(geminiGroundingSample);

  assert.match(result.content, /Spain won Euro 2024/u);
  assert.deepEqual(result.web_search_queries, ["UEFA Euro 2024 winner"]);
  assert.equal(result.grounding_chunks.length, 1);
  assert.equal(result.grounding_chunks[0].title, "uefa.com");
  assert.equal(result.grounding_supports.length, 1);
  assert.deepEqual(result.grounding_supports[0].chunk_indices, [0]);
});

test("validateManusCreateTaskResponse accepts create-task payload", () => {
  const result = validateManusCreateTaskResponse(manusCreateTaskSample);

  assert.equal(result.task_id, "task_123");
  assert.match(result.task_url, /task_123/u);
});
