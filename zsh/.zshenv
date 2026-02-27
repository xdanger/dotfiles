# ① 所有 zsh
# 最小环境：PATH/LANG/EDITOR 等任何场景都需要的变量

typeset -U path fpath manpath

# reset $FPATH to remove /usr/local/share/zsh/site-functions
fpath=(${fpath:#/usr/local/share/zsh/site-functions})

# Get absolute realpath of this dotfiles repo
export DOTFILES="${${(%):-%N}:A:h:h}"

# The directory `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, `.zlogout`
# are used by zsh to load environment variables and configurations.
export ZDOTDIR="$DOTFILES/zsh"
# Set ZSH environment variable
export ZSH="$ZDOTDIR/oh-my-zsh"

# Language and editor
export LANG=en_US.UTF-8
export EDITOR=vim
export ARCHFLAGS="-arch $(uname -m)"

# npm
export npm_config_yes=true

# direnv: suppress loading/unloading messages
export DIRENV_LOG_FORMAT=

# Go
(( $+commands[go] )) && export GOBIN="$HOME/.local/bin"

# other envs
[[ -f "$HOME/.dotlocal/envs.zsh" ]] && source "$HOME/.dotlocal/envs.zsh"
# add ./bin to $PATH
[[ -d "$DOTFILES/bin" ]] && path+=("$DOTFILES/bin")
[[ -d "/opt/bin" ]] && path+=("/opt/bin")
