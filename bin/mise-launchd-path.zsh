#!/bin/zsh -f
set -eu

[[ "$OSTYPE" == darwin* ]] || exit 0
repo="${${(%):-%N}:A:h:h}"
# Preserve a previously configured launchd PATH; never inherit a project's PATH.
inherited_path=$(/bin/launchctl getenv PATH) || inherited_path=
export PATH="${inherited_path:-/usr/bin:/bin:/usr/sbin:/sbin}"
for tool_dir in /opt/homebrew/bin /opt/homebrew/sbin /usr/local/bin \
  "$HOME/.bun/bin" "$HOME/.cargo/bin" "$HOME/Library/pnpm/bin" "$repo/bin"; do
  [[ -d "$tool_dir" ]] && path+=("$tool_dir")
done
source "$repo/zsh/mise-path.zsh"
/bin/launchctl setenv PATH "$PATH"
