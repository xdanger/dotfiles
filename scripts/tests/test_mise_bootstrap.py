from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


POST_INSTALL = Path(__file__).resolve().parents[1] / "post-install.sh"
MISE_STUB = '#!/bin/sh\nprintf "mise %s\\n" "$*" >> "$TEST_LOG"\n'


class MiseBootstrapTest(unittest.TestCase):
    def run_install(self, existing):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            commands = root / "commands"
            home.mkdir()
            commands.mkdir()
            log = root / "calls"

            def executable(path, content):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
                path.chmod(0o755)

            executable(commands / "git", "#!/bin/sh\nexit 0\n")
            executable(commands / "systemd-detect-virt", "#!/bin/sh\nexit 0\n")
            executable(
                commands / "curl",
                '''#!/bin/sh
printf 'bootstrap\n' >> "$TEST_LOG"
cat <<'INSTALLER'
mkdir -p "$(dirname "$MISE_INSTALL_PATH")"
cat > "$MISE_INSTALL_PATH" <<'MISE'
#!/bin/sh
printf 'mise %s\n' "$*" >> "$TEST_LOG"
MISE
chmod +x "$MISE_INSTALL_PATH"
INSTALLER
''',
            )
            # Keep host tool installations out of the test's command lookup.
            for name in ("bash", "sh", "dirname", "mkdir", "cat", "chmod"):
                executable_path = shutil.which(name)
                self.assertIsNotNone(executable_path, name)
                (commands / name).symlink_to(executable_path)
            if existing == "local":
                executable(home / ".local/bin/mise", MISE_STUB)
            elif existing == "path":
                executable(commands / "mise", MISE_STUB)
            subprocess.run(
                ["/bin/bash", str(POST_INSTALL)],
                env={"HOME": str(home), "PATH": str(commands), "TEST_LOG": str(log)},
                check=True,
                capture_output=True,
                text=True,
            )
            return log.read_text().splitlines()

    def test_fresh_install_bootstraps_before_installing_tools(self):
        self.assertEqual(self.run_install(None), ["bootstrap", "mise install"])

    def test_existing_local_install_is_added_to_path(self):
        self.assertEqual(self.run_install("local"), ["mise install"])

    def test_existing_path_install_is_reused(self):
        self.assertEqual(self.run_install("path"), ["mise install"])


if __name__ == "__main__":
    unittest.main()
