#!/bin/zsh -f
set -eu

[[ "$OSTYPE" == darwin* ]] || exit 0
repo="${${(%):-%N}:A:h:h}"
label="com.xdanger.mise-path"
agent_dir="$HOME/Library/LaunchAgents"
plist="$agent_dir/$label.plist"
domain="gui/$(/usr/bin/id -u)"

/bin/mkdir -p "$agent_dir"
/usr/bin/plutil -create xml1 "$plist"
/usr/bin/plutil -insert Label -string "$label" "$plist"
/usr/bin/plutil -insert ProgramArguments -array "$plist"
/usr/bin/plutil -insert ProgramArguments.0 -string /bin/zsh "$plist"
/usr/bin/plutil -insert ProgramArguments.1 -string -f "$plist"
/usr/bin/plutil -insert ProgramArguments.2 -string "$repo/bin/mise-launchd-path.zsh" "$plist"
/usr/bin/plutil -insert RunAtLoad -bool YES "$plist"
/usr/bin/plutil -lint "$plist"

if /bin/launchctl print "$domain" >/dev/null 2>&1; then
  if /bin/launchctl print "$domain/$label" >/dev/null 2>&1; then
    /bin/launchctl bootout "$domain/$label"
  fi
  /bin/launchctl bootstrap "$domain" "$plist"
else
  print -r -- "Installed $plist; it will run at the next GUI login."
fi
