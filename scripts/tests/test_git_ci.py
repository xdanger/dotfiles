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
            "CEREBRAS_API_KEY": "test-key",
            "CEREBRAS_MODEL": "test-model",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        subprocess.run(["git", "init", "-q"], check=True)
        Path("sample.txt").write_text("staged version\n")
        ci.git("add", "sample.txt")
        Path("sample.txt").write_text("unstaged secret\n")
        Path("untracked.txt").write_text("untracked secret\n")

    def response(self, message=MESSAGE, reason="stop"):
        return io.BytesIO(json.dumps({"choices": [{
            "message": {"content": message}, "finish_reason": reason,
        }]}).encode())

    def test_dry_run_sends_only_index_and_preserves_worktree(self):
        output = io.StringIO()
        before = ci.git("status", "--porcelain")
        with patch.object(ci.urllib.request, "urlopen", return_value=self.response()) as api:
            with patch("sys.argv", ["git-ci", "--dry-run"]), contextlib.redirect_stdout(output):
                self.assertEqual(ci.main(), 0)
        request = api.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.cerebras.ai/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-key")
        self.assertEqual(request.get_header("User-agent"), "git-ci/1.0")
        self.assertEqual(payload["model"], "test-model")
        diff = payload["messages"][1]["content"]
        self.assertIn("+staged version", diff)
        self.assertNotIn("unstaged secret", diff)
        self.assertNotIn("untracked secret", diff)
        self.assertEqual(output.getvalue(), MESSAGE + "\n")
        self.assertEqual(ci.git("status", "--porcelain"), before)

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
        for message, reason in [("", "stop"), (None, "stop"), (MESSAGE, "length"), ("```text", "stop")]:
            with self.subTest(message=message, reason=reason):
                with patch.object(ci.urllib.request, "urlopen", return_value=self.response(message, reason)):
                    with self.assertRaises(ValueError):
                        ci.generate_message("diff", "test-key")
        with patch.object(ci.urllib.request, "urlopen", return_value=io.BytesIO(b"{}")):
            with self.assertRaisesRegex(ValueError, "unexpected response"):
                ci.generate_message("diff", "test-key")

    def test_http_failure_is_clear(self):
        error = urllib.error.HTTPError("url", 429, "rate limit", {}, None)
        with patch.object(ci.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(ValueError, "HTTP 429"):
                ci.generate_message("diff", "test-key")

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
