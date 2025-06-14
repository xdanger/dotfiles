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
export DOTFILES
DOTFILES="$( cd -P "$( dirname "$SOURCE" )/$RELATE_TO_DOTFILES" && pwd )"

# The directory `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, `.zlogout`
# are used by zsh to load environment variables and configurations.
export ZDOTDIR="$DOTFILES/zsh"
# Set ZSH environment variable
export ZSH="$ZDOTDIR/oh-my-zsh"

# other envs
[ -f "$ZDOTDIR/../../.dotlocal/envs.zsh" ] && source "$ZDOTDIR/../../.dotlocal/envs.zsh"
# add ./bin to $PATH
[ -d "$DOTFILES/bin" ] && path+=("$DOTFILES/bin")
[ -d "/opt/bin" ] && path+=("/opt/bin")

command -v go &>/dev/null && go env -w GOBIN=$HOME/.local/bin
