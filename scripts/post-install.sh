#!/usr/bin/env bash

# ensure missing properties in `.git/config` will be "synced" by `.gitmodules`
git submodule sync --recursive
# ensure existing properties in `.git/config` will be "updated" from `.gitmodules`
git submodule update --init --recursive

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[[ $CODESPACES == "true" ]] && ln -sf $PWD/git/gitconfig.codespaces ~/.gitconfig
# link ~/.gitconfig to gitconfig.wsl in Windows Subsystem for Linux
[[ -n ${WSL_DISTRO_NAME:-} ]] && ln -sf $PWD/git/gitconfig.wsl ~/.gitconfig

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
  exit 0
fi

if [[ `uname` == "Darwin" ]]; then
  # macOS
  # clang -framework Carbon util/reset-input.m -o bin/reset-input
  brew update && brew upgrade
  brew install --quiet ack ag aria2 bat csvkit curl diff-so-fancy difftastic direnv duf dust entr eza fd fortune fzf git-delta gitkraken-cli glab glow htop hyperfine jq just lsof ncdu netcat noti prettyping ripgrep sd socat tldr tokei trash-cli tree watchexec wget yq yt-dlp font-droid-sans-mono-nerd-font font-im-writing-nerd-font
  # brew tap homebrew/cask-fonts && brew install -f font-fira-code
elif [[ `uname` == "Linux" ]]; then
  # Other Linux distributions
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  RUST_TARGET="x86_64-unknown-linux-gnu"; SD_TARGET="x86_64-unknown-linux-gnu"; GO_ARCH="amd64" ;;
    aarch64) RUST_TARGET="aarch64-unknown-linux-gnu"; SD_TARGET="aarch64-unknown-linux-musl"; GO_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ack aria2 bat csvkit curl direnv duf entr eza fd-find fortune-mod fzf git git-delta htop hyperfine jq lsof ncdu netcat-openbsd prettyping ripgrep silversearcher-ag socat tldr trash-cli tree wget yt-dlp
  # Debian/Ubuntu renames: bat→batcat, fd-find→fdfind
  [ -x /usr/bin/batcat ] && sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
  [ -x /usr/bin/fdfind ] && sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
  # Tools not in standard apt repos — install via snap
  if command -v snap >/dev/null 2>&1; then
    sudo snap install diff-so-fancy difftastic glab glow gitkraken-cli
    sudo snap install just --classic
    sudo snap install dust  # du alternative (apt package `du-dust` does not exist)
  fi
  # snap `difftastic` binary is named `difftastic`, alias to `difft`
  [ -x /snap/bin/difftastic ] && sudo ln -sf /snap/bin/difftastic /usr/local/bin/difft
  # tokei — no pre-built binaries in GitHub releases; install via cargo
  if command -v cargo >/dev/null 2>&1; then
    cargo install tokei
  else
    echo "Warning: cargo not found, skipping tokei installation"
  fi
  # yq v4 (apt `yq` is the legacy Python wrapper, not mikefarah/yq)
  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${GO_ARCH} && sudo chmod +x /usr/local/bin/yq
  # sd (sed alternative)
  SD_VER=$(curl -fsSL https://api.github.com/repos/chmln/sd/releases/latest | jq -r '.tag_name')
  curl -fsSL "https://github.com/chmln/sd/releases/download/${SD_VER}/sd-${SD_VER}-${SD_TARGET}.tar.gz" | sudo tar xz --strip-components=1 -C /usr/local/bin "sd-${SD_VER}-${SD_TARGET}/sd"
  # watchexec
  WATCHEXEC_VER=$(curl -fsSL https://api.github.com/repos/watchexec/watchexec/releases/latest | jq -r '.tag_name' | sed 's/^v//')
  curl -fsSL "https://github.com/watchexec/watchexec/releases/download/v${WATCHEXEC_VER}/watchexec-${WATCHEXEC_VER}-${RUST_TARGET}.tar.xz" | sudo tar xJ --strip-components=1 -C /usr/local/bin
  # noti (command notification) — only amd64 binaries available
  if [[ "$GO_ARCH" == "amd64" ]]; then
    NOTI_VER=$(curl -fsSL https://api.github.com/repos/variadico/noti/releases/latest | jq -r '.tag_name')
    curl -fsSL "https://github.com/variadico/noti/releases/download/${NOTI_VER}/noti${NOTI_VER}.linux-amd64.tar.gz" | sudo tar xz -C /usr/local/bin noti
  fi
fi
