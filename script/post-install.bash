# init git submodules
git submodule update --init --recursive --force

# link ~/.gitconfig to gitconfig_codespaces in GitHub Codespaces
[ $CODESPACES = 'true' ] && ln -sf $PWD/git/gitconfig_codespaces ~/.gitconfig

./fzf/install --bin

cp ./diff-so-fancy/diff-so-fancy ./bin/diff-so-fancy && cp ./diff-so-fancy/lib/* ./bin/lib/

[ `uname` = 'Darwin' ] && clang -framework Carbon util/reset-input.m -o bin/reset-input

# brew update && brew upgrade
# brew install nodejs bat prettyping htop diff-so-fancy ncdu tldr ack ag fortune ponysay csvkit noti entr youtube-dl aria2 yt-dlp
# brew tap homebrew/cask-fonts && brew install -f font-fira-code
