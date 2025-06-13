# 同步 .gitmodules 改动
git submodule sync --recursive
# 确保剩余子模块正常
git submodule update --init --recursive

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[[ $CODESPACES == "true" ]] && ln -sf $PWD/git/gitconfig.codespaces ~/.gitconfig
# link ~/.gitconfig to gitconfig.wsl in Windows Subsystem for Linux
[[ -n ${WSL_DISTRO_NAME:-} ]] && ln -sf $PWD/git/gitconfig.wsl ~/.gitconfig

#!/usr/bin/env bash
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
  brew install --quiet ack ag aria2 bat csvkit diff-so-fancy entr fortune fzf git-delta gitkraken-cli glab \
  htop ncdu noti ripgrep prettyping tldr yt-dlp font-im-writing-nerd-font font-droid-sans-mono-nerd-font
  # brew tap homebrew/cask-fonts && brew install -f font-fira-code
elif [[ `uname` == "Linux" ]]; then
  # Other Linux distributions
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ack bat fzf htop jq ripgrep prettyping tldr
fi
