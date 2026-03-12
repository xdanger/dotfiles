import unittest

from manus_client import collect_assistant_outputs


class CollectAssistantOutputsTest(unittest.TestCase):
    def test_collects_only_assistant_content(self) -> None:
        texts, files = collect_assistant_outputs(
            {
                "output": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "output_text", "text": "prompt"},
                            {
                                "type": "output_file",
                                "fileUrl": "https://example.com/input.txt",
                                "fileName": "input.txt",
                            },
                        ],
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": "thinking"}],
                    },
                    {
                        "role": "assistant",
                        "content": [
                            {"type": "output_text", "text": "final answer"},
                            {
                                "type": "output_file",
                                "fileUrl": "https://example.com/output.txt",
                                "fileName": "output.txt",
                            },
                        ],
                    },
                ]
            }
        )

        self.assertEqual(texts, ["thinking", "final answer"])
        self.assertEqual(
            files,
            [{"url": "https://example.com/output.txt", "name": "output.txt"}],
        )


if __name__ == "__main__":
    unittest.main()
