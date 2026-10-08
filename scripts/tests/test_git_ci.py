import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader("git_ci", str(ROOT / "bin/git-ci"))
spec = importlib.util.spec_from_loader(loader.name, loader)
ci = importlib.util.module_from_spec(spec)
loader.exec_module(ci)
MESSAGE = "✨ feat(app): support staged content\n\n- :sparkles: preserve intent"


class GitCiTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        cwd = os.getcwd()
        os.chdir(self.directory.name)
        self.addCleanup(os.chdir, cwd)
        self.env = patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "anthropic-key",
            "OPENAI_API_KEY": "openai-key",
            "GIT_CI_MODEL": "test-model",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        for name in ["GIT_CI_PROVIDER", "GIT_CI_EFFORT", "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL"]:
            os.environ.pop(name, None)
        subprocess.run(["git", "init", "-q"], check=True)
        Path("sample.txt").write_text("staged version\n")
        ci.git("add", "sample.txt")
        Path("sample.txt").write_text("unstaged secret\n")
        Path("untracked.txt").write_text("untracked secret\n")

    def response(self, provider, message=MESSAGE, reason=None):
        if provider == "anthropic":
            body = {"stop_reason": reason or "end_turn", "content": [
                {"type": "thinking", "thinking": "", "signature": "sig"},
                {"type": "text", "text": message},
            ]}
        else:
            body = {"choices": [{"message": {"content": message}, "finish_reason": reason or "stop"}]}
        return io.BytesIO(json.dumps(body).encode())

    def test_dry_run_sends_only_index_and_preserves_worktree(self):
        cases = {
            "anthropic": ("https://api.anthropic.com/v1/messages", "X-api-key", "anthropic-key"),
            "openai": ("https://api.openai.com/v1/chat/completions", "Authorization", "Bearer openai-key"),
        }
        for provider, (url, header, value) in cases.items():
            with self.subTest(provider=provider):
                output = io.StringIO()
                before = ci.git("status", "--porcelain")
                with patch.object(ci.urllib.request, "urlopen", return_value=self.response(provider)) as api:
                    argv = ["git-ci", "--dry-run", "--provider", provider]
                    with patch("sys.argv", argv), contextlib.redirect_stdout(output):
                        self.assertEqual(ci.main(), 0)
                request = api.call_args.args[0]
                payload = json.loads(request.data)
                self.assertEqual(request.full_url, url)
                self.assertEqual(request.get_header(header), value)
                self.assertEqual(request.get_header("User-agent"), "git-ci/1.0")
                self.assertEqual(payload["model"], "test-model")
                diff = payload["messages"][-1]["content"]
                self.assertIn("+staged version", diff)
                self.assertNotIn("unstaged secret", diff)
                self.assertNotIn("untracked secret", diff)
                self.assertEqual(output.getvalue(), MESSAGE + "\n")
                self.assertEqual(ci.git("status", "--porcelain"), before)

    def test_anthropic_request_shape(self):
        os.environ.pop("GIT_CI_MODEL")
        with patch.object(ci.urllib.request, "urlopen", return_value=self.response("anthropic")) as api:
            ci.generate_message("diff", "anthropic", "anthropic-key")
        request = api.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.get_header("Anthropic-version"), "2023-06-01")
        self.assertIsNone(request.get_header("Authorization"))
        self.assertEqual(payload["model"], "claude-haiku-5-5")
        self.assertEqual(payload["system"], ci.PROMPT)
        self.assertEqual(payload["messages"], [{"role": "user", "content": "diff"}])
        self.assertEqual(payload["output_config"], {"effort": "medium"})

    def test_openai_request_shape_and_effort_override(self):
        os.environ.pop("GIT_CI_MODEL")
        for effort, expected in [(None, "medium"), ("high", "high")]:
            with self.subTest(effort=effort):
                if effort:
                    os.environ["GIT_CI_EFFORT"] = effort
                with patch.object(ci.urllib.request, "urlopen", return_value=self.response("openai")) as api:
                    ci.generate_message("diff", "openai", "openai-key")
                payload = json.loads(api.call_args.args[0].data)
                self.assertEqual(payload["model"], "gpt-6-luna")
                self.assertEqual(payload["reasoning_effort"], expected)

    def test_overridden_model_omits_effort_unless_set(self):
        for provider, field in [("anthropic", "output_config"), ("openai", "reasoning_effort")]:
            for effort in [None, "low"]:
                with self.subTest(provider=provider, effort=effort):
                    if effort:
                        os.environ["GIT_CI_EFFORT"] = effort
                    else:
                        os.environ.pop("GIT_CI_EFFORT", None)
                    with patch.object(ci.urllib.request, "urlopen", return_value=self.response(provider)) as api:
                        ci.generate_message("diff", provider, "test-key")
                    payload = json.loads(api.call_args.args[0].data)
                    if effort:
                        self.assertIn(effort, json.dumps(payload[field]))
                    else:
                        self.assertNotIn(field, payload)

    def test_provider_selection_and_base_url_override(self):
        os.environ["GIT_CI_PROVIDER"] = "openai"
        os.environ["OPENAI_BASE_URL"] = "https://api.cerebras.ai/v1/"
        with patch.object(ci.urllib.request, "urlopen", return_value=self.response("openai")) as api:
            with patch("sys.argv", ["git-ci", "--dry-run"]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ci.main(), 0)
        self.assertEqual(api.call_args.args[0].full_url, "https://api.cerebras.ai/v1/chat/completions")
        with patch.object(ci.urllib.request, "urlopen", return_value=self.response("anthropic")) as api:
            argv = ["git-ci", "--dry-run", "--provider", "anthropic"]
            with patch("sys.argv", argv), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ci.main(), 0)
        request = api.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.anthropic.com/v1/messages")
        self.assertEqual(request.get_header("X-api-key"), "anthropic-key")
        os.environ["GIT_CI_PROVIDER"] = "bogus"
        with patch("sys.argv", ["git-ci"]), self.assertRaisesRegex(ValueError, "Unknown provider"):
            ci.main()

    def test_missing_key_names_provider_variable(self):
        os.environ.pop("ANTHROPIC_API_KEY")
        with patch("sys.argv", ["git-ci"]), self.assertRaisesRegex(ValueError, "ANTHROPIC_API_KEY"):
            ci.main()

    def test_commit_passes_message_literally_and_propagates_failure(self):
        message = MESSAGE + "\n- :memo: `code` $(touch unsafe)"
        with patch.object(ci, "generate_message", return_value=message), patch.object(
            ci, "git", side_effect=["tree", "diff", "tree"]
        ):
            with patch("sys.argv", ["git-ci"]), patch.object(ci.subprocess, "run") as commit:
                commit.return_value.returncode = 7
                self.assertEqual(ci.main(), 7)
        commit.assert_called_once_with(
            ["git", "commit", "--file=-"], input=message + "\n", encoding="utf-8"
        )
        self.assertFalse(Path("unsafe").exists())

    def test_index_change_aborts(self):
        def generate(*args):
            ci.git("add", "sample.txt")
            return MESSAGE

        with patch.object(ci, "generate_message", side_effect=generate):
            with patch("sys.argv", ["git-ci"]), self.assertRaisesRegex(ValueError, "changed during"):
                ci.main()

    def test_empty_index_and_oversize_diff_do_not_call_api(self):
        for content, error in [(None, "No staged changes"), ("x" * 120_001, "exceeds")]:
            with self.subTest(error=error):
                ci.git("rm", "--cached", "-f", "sample.txt")
                if content is not None:
                    Path("sample.txt").write_text(content)
                    ci.git("add", "sample.txt")
                with patch.object(ci, "generate_message") as api, patch("sys.argv", ["git-ci"]):
                    with self.assertRaisesRegex(ValueError, error):
                        ci.main()
                    api.assert_not_called()
                if content is None:
                    ci.git("add", "sample.txt")

    def test_bad_responses_are_rejected(self):
        for provider, truncated in [("anthropic", "max_tokens"), ("openai", "length")]:
            for message, reason in [("", None), (None, None), (MESSAGE, truncated), ("```text", None)]:
                with self.subTest(provider=provider, message=message, reason=reason):
                    response = self.response(provider, message, reason)
                    with patch.object(ci.urllib.request, "urlopen", return_value=response):
                        with self.assertRaises(ValueError):
                            ci.generate_message("diff", provider, "test-key")
            with patch.object(ci.urllib.request, "urlopen", return_value=io.BytesIO(b"{}")):
                with self.assertRaisesRegex(ValueError, "unexpected response"):
                    ci.generate_message("diff", provider, "test-key")
        refusal = io.BytesIO(json.dumps({"stop_reason": "refusal", "content": []}).encode())
        with patch.object(ci.urllib.request, "urlopen", return_value=refusal):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                ci.generate_message("diff", "anthropic", "test-key")

    def test_http_failure_is_clear(self):
        error = urllib.error.HTTPError("url", 429, "rate limit", {}, None)
        with patch.object(ci.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(ValueError, "Anthropic API returned HTTP 429"):
                ci.generate_message("diff", "anthropic", "test-key")

    def test_alias_forwards_arguments_from_subdirectory(self):
        alias = ci.git("config", "--file", str(ROOT / "git/gitconfig"), "--get", "alias.ci").strip()
        Path("nested").mkdir()
        result = subprocess.run(
            ["git", "-c", f"alias.ci={alias}", "ci", "-h"],
            cwd="nested", env={**os.environ, "DOTFILES": str(ROOT)},
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--dry-run", result.stdout)


if __name__ == "__main__":
    unittest.main()
