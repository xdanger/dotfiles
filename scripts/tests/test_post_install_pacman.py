from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


POST_INSTALL = Path(__file__).resolve().parents[1] / "post-install.sh"
PACKAGES = "aria2 entr fortune-mod ncdu openbsd-netcat prettyping socat"


class PacmanInstallTest(unittest.TestCase):
    def run_install(self, omarchy, query_output="", query_status=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            commands = root / "commands"
            home.mkdir()
            commands.mkdir()
            log = root / "calls"

            def executable(name, content):
                path = commands / name
                path.write_text(content)
                path.chmod(0o755)

            executable("git", "#!/bin/sh\nexit 0\n")
            executable("systemd-detect-virt", "#!/bin/sh\nexit 1\n")
            executable("uname", "#!/bin/sh\necho Linux\n")
            executable("sudo", '#!/bin/sh\nexec "$@"\n')
            executable("mise", '#!/bin/sh\nprintf "mise %s\\n" "$*" >> "$TEST_LOG"\n')
            executable(
                "pacman",
                f'''#!/bin/sh
printf 'pacman %s\\n' "$*" >> "$TEST_LOG"
if [ "$1" = -T ]; then
  printf '%s' '{query_output}'
  exit {query_status}
fi
''',
            )
            if omarchy:
                executable("omarchy-update", "#!/bin/sh\nexit 0\n")
            # Keep host tool installations out of the test's command lookup.
            for name in ("bash", "sh", "dirname"):
                executable_path = shutil.which(name)
                self.assertIsNotNone(executable_path, name)
                (commands / name).symlink_to(executable_path)
            result = subprocess.run(
                ["/bin/bash", str(POST_INSTALL)],
                env={"HOME": str(home), "PATH": str(commands), "TEST_LOG": str(log)},
                capture_output=True,
                text=True,
            )
            calls = log.read_text().splitlines() if log.exists() else []
            return result.returncode, calls

    def test_omarchy_installs_only_missing_packages(self):
        status, calls = self.run_install(True, "entr\nsocat\n", 127)
        self.assertEqual(status, 0)
        self.assertEqual(
            calls,
            [
                f"pacman -T {PACKAGES}",
                "pacman -S --needed --noconfirm entr socat",
                "mise install",
            ],
        )

    def test_omarchy_skips_pacman_when_nothing_is_missing(self):
        status, calls = self.run_install(True)
        self.assertEqual(status, 0)
        self.assertEqual(calls, [f"pacman -T {PACKAGES}", "mise install"])

    def test_omarchy_fails_when_package_query_fails(self):
        status, calls = self.run_install(True, query_status=1)
        self.assertEqual(status, 1)
        self.assertEqual(calls, [f"pacman -T {PACKAGES}"])

    def test_other_arch_hosts_upgrade_with_install(self):
        status, calls = self.run_install(False)
        self.assertEqual(status, 0)
        self.assertEqual(
            calls, [f"pacman -Syu --needed --noconfirm {PACKAGES}", "mise install"]
        )


if __name__ == "__main__":
    unittest.main()
