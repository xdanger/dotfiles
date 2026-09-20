import json
import os
import re


def _get_version():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        # Try package.json
        pkg_json = os.path.join(current_dir, "package.json")
        if os.path.isfile(pkg_json):
            try:
                with open(pkg_json, encoding="utf-8") as f:
                    return json.load(f)["version"]
            except Exception:
                pass

        # Try .claude-plugin/plugin.json
        claude_plugin = os.path.join(current_dir, ".claude-plugin", "plugin.json")
        if os.path.isfile(claude_plugin):
            try:
                with open(claude_plugin, encoding="utf-8") as f:
                    return json.load(f)["version"]
            except Exception:
                pass

        # Try .codex-plugin/plugin.json
        codex_plugin = os.path.join(current_dir, ".codex-plugin", "plugin.json")
        if os.path.isfile(codex_plugin):
            try:
                with open(codex_plugin, encoding="utf-8") as f:
                    return json.load(f)["version"]
            except Exception:
                pass

        # Plain-folder installs may not include package metadata.
        # Fall back to the visible SKILL.md version.
        skill_md = os.path.join(current_dir, "SKILL.md")
        if os.path.isfile(skill_md):
            try:
                with open(skill_md, encoding="utf-8") as f:
                    match = re.search(r"Skill\s*版本[:：]\s*v?([^\s]+)", f.read())
                    if match:
                        return match.group(1)
            except Exception:
                pass

        parent_dir = os.path.dirname(current_dir)
        if parent_dir == current_dir:
            break
        current_dir = parent_dir

    return "unknown"


__version__ = _get_version()
