#!/bin/bash
# ai-agent power-monitor (macOS) — installer for the thin collector daemon.
#
# This installs ONE thing: a root LaunchDaemon that runs collect.py from this
# repo every few minutes to append power/load data points. Analysis, fixes, and
# script self-optimization are done by Claude via a scheduled Routine (see
# README) — no `claude` is invoked from any script here.
#
# Run as your normal user (NOT via sudo); it uses `sudo -n` only for privileged
# bits and relies on the /etc/sudoers.d/ai-agent NOPASSWD grant.
#
#   ./install.sh                 install / refresh (collector every 5 min)
#   ./install.sh --interval 120  sample every 120s instead of 300s
#   ./install.sh --uninstall     remove the collector (keeps data)
#   ./install.sh --uninstall --purge   also delete collected data
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
COLLECT="$REPO/collect.py"
DATA="$HOME/.local/state/ai-agent/power-monitor"
LOG_DIR="$DATA/state"
LABEL="com.ai-agent.power-collector"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
INTERVAL=300; UNINSTALL=0; PURGE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2;;
    --uninstall) UNINSTALL=1; shift;;
    --purge) PURGE=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

sudo -n true 2>/dev/null || { echo "ERROR: need passwordless sudo (/etc/sudoers.d/ai-agent)." >&2; exit 1; }

# Tidy up artifacts from the earlier (claude-invoking) layout, if present.
launchctl bootout "gui/$(id -u)/com.ai-agent.power-audit" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.ai-agent.power-audit.plist"
sudo -n rm -rf /usr/local/libexec/ai-agent 2>/dev/null || true

if [ "$UNINSTALL" = 1 ]; then
  sudo -n launchctl bootout "system/$LABEL" 2>/dev/null || true
  sudo -n rm -f "$PLIST"
  [ "$PURGE" = 1 ] && { echo "purging $DATA"; rm -rf "$DATA"; }
  echo "✓ collector uninstalled."
  exit 0
fi

echo "• data dirs   → $DATA"
mkdir -p "$DATA/raw" "$DATA/archive" "$LOG_DIR"

echo "• collector   → runs $COLLECT every ${INTERVAL}s (as root)"
TMP="$(mktemp)"
sed -e "s|__COLLECT__|$COLLECT|g" -e "s|__DATA_DIR__|$DATA|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" -e "s|__INTERVAL__|$INTERVAL|g" \
    "$REPO/com.ai-agent.power-collector.plist" > "$TMP"
sudo -n cp "$TMP" "$PLIST"; rm -f "$TMP"
sudo -n chown root:wheel "$PLIST"; sudo -n chmod 644 "$PLIST"
sudo -n launchctl bootout "system/$LABEL" 2>/dev/null || true
sudo -n launchctl bootstrap system "$PLIST"
sudo -n launchctl kickstart -k "system/$LABEL"

echo
echo "✓ installed."
echo "  status : sudo -n launchctl print system/$LABEL"
echo "  log    : $LOG_DIR/collector.log"
echo "  data   : $DATA"
echo "  audit  : run /power-audit manually, or paste the Routine prompt (README) into a Claude App Routine"
