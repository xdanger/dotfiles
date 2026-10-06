from pathlib import Path
import subprocess
import tempfile
import unittest


AMP_RUNNER = Path(__file__).resolve().parents[2] / "bin" / "amp-runner"


class AmpRunnerTest(unittest.TestCase):
    def run_runner(self, present, links={}):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            home.mkdir()
            for name in present:
                (home / name).mkdir(parents=True)
            for name, target in links.items():
                (home / name).symlink_to(target)
            shims = home / ".local/share/mise/shims"
            shims.mkdir(parents=True)
            log = root / "calls"
            amp = shims / "amp"
            amp.write_text(
                '#!/bin/sh\npwd > "$TEST_LOG"\nfor a in "$@"; do echo "$a" >> "$TEST_LOG"; done\n'
            )
            amp.chmod(0o755)
            result = subprocess.run(
                ["bash", str(AMP_RUNNER)],
                env={
                    "HOME": str(home),
                    "PATH": "/usr/bin:/bin",
                    "AMP_RUNNER_ID": "box.example.com",
                    "TEST_LOG": str(log),
                },
                capture_output=True,
                text=True,
            )
            calls = log.read_text().splitlines() if log.exists() else []
            return result, [c.replace(str(home), "~") for c in calls]

    def test_serves_only_present_directories(self):
        result, calls = self.run_runner(["repos", ".dotfiles", "Dropbox/@taptap"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            calls,
            [
                "~/repos",
                "--no-tui",
                "--runner-id",
                "box",
                "--dir",
                "~/.dotfiles",
                "--dir",
                "~/Dropbox/@taptap",
                "--discover-dirs",
                "--remote-control-terminal",
                "--amp-env",
            ],
        )
        self.assertIn("skipping missing directory", result.stderr)

    def test_starts_in_first_present_directory_without_repos(self):
        result, calls = self.run_runner([".dotlocal"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0], "~/.dotlocal")
        self.assertNotIn("--dir", calls)

    def test_serves_lowercase_dropbox(self):
        result, calls = self.run_runner(["repos", "dropbox/@veronica"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[4:6], ["--dir", "~/dropbox/@veronica"])

    def test_skips_directories_resolving_to_one_already_served(self):
        result, calls = self.run_runner(
            ["repos", "Dropbox/@xdanger"], links={"dropbox": "Dropbox"}
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls.count("~/Dropbox/@xdanger"), 1)
        self.assertNotIn("~/dropbox/@xdanger", calls)
        self.assertIn("skipping duplicate directory", result.stderr)

    def test_exits_config_error_when_nothing_exists(self):
        result, calls = self.run_runner([])
        self.assertEqual(result.returncode, 78)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
