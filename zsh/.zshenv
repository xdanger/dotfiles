# ① 所有 zsh
# 最小环境：PATH/LANG/EDITOR 等任何场景都需要的变量

# reset $FPATH to remove /usr/local/share/zsh/site-functions
typeset -U fpath
fpath=(${fpath:#/usr/local/share/zsh/site-functions})

RELATE_TO_DOTFILES=".."
# First of all, get absolute realpath of this dotfiles repo
# The following block is for zsh
SOURCE=${(%):-%N}
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
export DOTFILES="$( cd -P "$( dirname "$SOURCE" )/$RELATE_TO_DOTFILES" && pwd )"

# The directory `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, `.zlogout`
# are used by zsh to load environment variables and configurations.
export ZDOTDIR="$DOTFILES/zsh"
# Set ZSH environment variable
export ZSH="$ZDOTDIR/oh-my-zsh"

# rvm
[ -s "$HOME/.rvm/scripts/rvm" ] && source "$HOME/.rvm/scripts/rvm"
# [ -d "$HOME/.rvm/bin" ] && path+=("$HOME/.rvm/bin")
# virtualenv
[ -d "$HOME/.local/bin" ] && path+=("$HOME/.local/bin")
# Python installations by [uv](https://github.com/astral-sh/uv)
[ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env"
# nvm & node
[ -f "$HOME/.nvm/nvm.sh" ] && export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
# Deno
if [ -d "$HOME/.deno/bin" ]; then
  export DENO_INSTALL="$HOME/.deno"
  path=("$DENO_INSTALL/bin" $path)
fi
# Bun
if [ -d "$HOME/.bun" ]; then
  export BUN_INSTALL="$HOME/.bun" && path+=("$BUN_INSTALL/bin")
  # completion in macOS
  [ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"
fi
# Rust
[ -d "$HOME/.cargo/bin" ] && \. "$HOME/.cargo/env"

# other envs
[ -f "$ZDOTDIR/../../.dotlocal/envs.zsh" ] && source "$ZDOTDIR/../../.dotlocal/envs.zsh"
# add ./bin to $PATH
[ -d "$DOTFILES/bin" ] && path+=("$DOTFILES/bin")
[ -d "/opt/bin" ] && path+=("/opt/bin")
