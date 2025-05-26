# init git submodules
git submodule update --init --recursive --force

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[[ $CODESPACES == "true" ]] && ln -sf $PWD/git/gitconfig.codespaces ~/.gitconfig

# link ~/.gitconfig to gitconfig.wsl in Windows Subsystem for Linux
is_wsl() {
  [[ -f "/proc/sys/fs/binfmt_misc/WSLInterop" ]] && return 0
  # [[ $(<"/proc/sys/kernel/osrelease") == *[Mm]icrosoft* ]] && return 0
  [[ -n ${WSL_DISTRO_NAME:-} ]] && return 0
  return 1
}
is_wsl && ln -sf $PWD/git/gitconfig.wsl ~/.gitconfig

./fzf/install --bin

cp ./diff-so-fancy/diff-so-fancy ./bin/diff-so-fancy && cp ./diff-so-fancy/lib/* ./bin/lib/

[[ `uname` == "Darwin" ]] && clang -framework Carbon util/reset-input.m -o bin/reset-input

# brew update && brew upgrade
# brew install nodejs bat prettyping htop diff-so-fancy ncdu tldr ack ag fortune ponysay csvkit noti entr youtube-dl aria2 yt-dlp
# brew tap homebrew/cask-fonts && brew install -f font-fira-code
