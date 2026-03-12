import test from "node:test";
import assert from "node:assert/strict";

import { collectAssistantOutputs } from "./manus_client.mjs";

test("collectAssistantOutputs keeps only assistant text and files", () => {
  const result = collectAssistantOutputs({
    output: [
      {
        role: "user",
        content: [
          { type: "output_text", text: "prompt" },
          {
            type: "output_file",
            fileUrl: "https://example.com/input.txt",
            fileName: "input.txt",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "thinking" }],
      },
      {
        role: "assistant",
        content: [
          { type: "output_text", text: "final answer" },
          {
            type: "output_file",
            fileUrl: "https://example.com/output.txt",
            fileName: "output.txt",
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    texts: ["thinking", "final answer"],
    files: [{ url: "https://example.com/output.txt", name: "output.txt" }],
  });
});
