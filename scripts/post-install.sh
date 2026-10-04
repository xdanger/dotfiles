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

if ! command -v mise >/dev/null 2>&1; then
  if [[ ! -x "$HOME/.local/bin/mise" ]]; then
    curl -fsSL https://mise.run | MISE_INSTALL_PATH="$HOME/.local/bin/mise" sh
  fi
  export PATH="$HOME/.local/bin:$PATH"
fi

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

  # 4) PID namespace 差异（非 root 在宿主机上读不到 /proc/1/ns/pid，此时跳过）
  local init_ns self_ns
  if init_ns=$(readlink /proc/1/ns/pid 2>/dev/null) \
     && self_ns=$(readlink /proc/self/ns/pid 2>/dev/null) \
     && [ "$init_ns" != "$self_ns" ]; then
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
  brew install --quiet aria2 entr fortune ncdu netcat prettyping socat font-geist-mono-nerd-font font-im-writing-nerd-font font-mona-sans font-jetbrains-maple-mono-nf font-maple-mono font-maple-mono-nf font-maple-mono-nf-cn
elif command -v pacman >/dev/null 2>&1; then
  # Arch-based Linux
  pacman_pkgs=(aria2 entr fortune-mod ncdu openbsd-netcat prettyping socat)
  if command -v omarchy-update >/dev/null 2>&1; then
    # Omarchy's pacman hook aborts direct upgrades; system upgrades belong to
    # `omarchy update`, so only install what is missing, without -Sy, to avoid
    # a partial upgrade
    missing_status=0
    missing_output=$(pacman -T "${pacman_pkgs[@]}") || missing_status=$?
    # `pacman -T` exits 127 when some packages are missing; any other failure
    # means the query itself failed
    if ((missing_status == 127)); then
      mapfile -t missing_pkgs <<<"$missing_output"
      sudo pacman -S --needed --noconfirm "${missing_pkgs[@]}"
    elif ((missing_status != 0)); then
      exit "$missing_status"
    fi
  else
    # partial upgrades are unsupported, so always -Syu
    sudo pacman -Syu --needed --noconfirm "${pacman_pkgs[@]}"
  fi
elif command -v apt >/dev/null 2>&1; then
  # Debian-based Linux
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y aria2 entr fortune-mod ncdu netcat-openbsd prettyping socat
fi

mise install
if [[ $(uname -s) == Linux ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
fi
