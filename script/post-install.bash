# 同步 .gitmodules 改动
git submodule sync --recursive
# 确保剩余子模块正常
git submodule update --init --recursive

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[[ $CODESPACES == "true" ]] && ln -sf $PWD/git/gitconfig.codespaces ~/.gitconfig
# link ~/.gitconfig to gitconfig.wsl in Windows Subsystem for Linux
[[ -n ${WSL_DISTRO_NAME:-} ]] && ln -sf $PWD/git/gitconfig.wsl ~/.gitconfig

# macOS
if [[ `uname` == "Darwin" ]]; then
  # clang -framework Carbon util/reset-input.m -o bin/reset-input
  brew update && brew upgrade
  brew install ack ag aria2 bat csvkit diff-so-fancy entr fortune fzf git-delta gitkraken-cli glab \
  htop ncdu noti ripgrep prettyping tldr yt-dlp font-im-writing-nerd-font font-droid-sans-mono-nerd-font
  # brew tap homebrew/cask-fonts && brew install -f font-fira-code
elif systemd-detect-virt --container --quiet; then
  # do nothing in container
elif [[ `uname` == "Linux" ]]; then
  # Other Linux distributions
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ack bat fzf htop jq ripgrep prettyping tldr
fi
