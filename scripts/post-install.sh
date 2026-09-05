#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

# ensure missing properties in `.git/config` will be "synced" by `.gitmodules`
git submodule sync --recursive
# ensure existing properties in `.git/config` will be "updated" from `.gitmodules`
git submodule update --init --recursive

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[[ ${CODESPACES:-} == "true" ]] && ln -sf "${REPO_ROOT}/git/gitconfig.codespaces" "${HOME}/.gitconfig"
# link ~/.gitconfig to gitconfig.wsl in Windows Subsystem for Linux
[[ -n ${WSL_DISTRO_NAME:-} ]] && ln -sf "${REPO_ROOT}/git/gitconfig.wsl" "${HOME}/.gitconfig"

is_container() {
  # 1) systemd-detect-virt
  if command -v systemd-detect-virt >/dev/null 2>&1 \
     && systemd-detect-virt --container --quiet; then
    return 0
  fi

  # 2) cgroup 路径
  if grep -qE '/(docker|kubepods|containerd|lxc)/' /proc/1/cgroup 2>/dev/null; then
    return 0
  fi

  # 3) 特定文件 / 环境变量
  if [ -f /.dockerenv ] || [ -f /run/.containerenv ] \
     || grep -qa '^container=' /proc/1/environ 2>/dev/null; then
    return 0
  fi

  # 4) PID namespace 差异
  if [ "$(stat -c %d /proc/1/ns/pid 2>/dev/null)" != \
       "$(stat -c %d /proc/self/ns/pid 2>/dev/null)" ]; then
    return 0
  fi

  return 1
}

if is_container; then
  mise install
  exit 0
fi

if [[ $(uname) == "Darwin" ]]; then
  # macOS
  # clang -framework Carbon util/reset-input.m -o bin/reset-input
  brew update && brew upgrade
  brew install --quiet ack ag aria2 csvkit curl direnv entr fortune git-delta gitkraken-cli glab htop lsof ncdu netcat noti prettyping socat tokei trash-cli tree wget font-droid-sans-mono-nerd-font font-im-writing-nerd-font
elif [[ $(uname) == "Linux" ]]; then
  # Other Linux distributions
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  GO_ARCH="amd64" ;;
    aarch64) GO_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ack aria2 csvkit curl direnv entr fortune-mod git git-delta htop jq lsof ncdu netcat-openbsd prettyping silversearcher-ag socat trash-cli tree wget
  SNAP_TOOLS=(diff-so-fancy gitkraken-cli glab)
  # Tools not in standard apt repos — install via snap when available
  if command -v snap >/dev/null 2>&1; then
    sudo snap install "${SNAP_TOOLS[@]}"
  else
    echo "Warning: snap not found; skipping optional repo-managed tools: ${SNAP_TOOLS[*]}." >&2
    echo "Install snapd and rerun ./install if you want those extra CLI tools." >&2
  fi
  # tokei — no pre-built binaries in GitHub releases; install via cargo
  if command -v cargo >/dev/null 2>&1; then
    cargo install tokei
  else
    echo "Warning: cargo not found, skipping tokei installation"
  fi
  # noti (command notification) — only amd64 binaries available
  if [[ "$GO_ARCH" == "amd64" ]]; then
    NOTI_VER=$(curl -fsSL https://api.github.com/repos/variadico/noti/releases/latest | jq -r '.tag_name')
    curl -fsSL "https://github.com/variadico/noti/releases/download/${NOTI_VER}/noti${NOTI_VER}.linux-amd64.tar.gz" | sudo tar xz -C /usr/local/bin noti
  fi
fi

mise install
if [[ $(uname -s) == Linux ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
fi
