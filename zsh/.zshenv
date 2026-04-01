# zsh startup order:
#   .zshenv -> [.zprofile if login] -> [.zshrc if interactive]
#   -> [.zlogin if login] -> [.zlogout on exit]
# 1. .zshenv: loaded by every zsh (login / interactive / script).
# Keep only minimal global environment here, and never produce output.
# On macOS, /etc/zprofile runs later and may reorder PATH via path_helper.
#
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
if [[ "$OSTYPE" == darwin* ]] && [[ -z "${ARCHFLAGS:-}" ]]; then
  export ARCHFLAGS="-arch $(uname -m)"
fi

# npm
export npm_config_yes=true

# direnv: suppress loading/unloading messages
export DIRENV_LOG_FORMAT=

# Go
(( $+commands[go] )) && export GOBIN="$HOME/.local/bin"

# other envs
[[ -f "$HOME/.dotlocal/envs.zsh" ]] && source "$HOME/.dotlocal/envs.zsh"
# Bootstrap Homebrew into PATH early for non-interactive shells that may skip
# `.zprofile`, while keeping heavier macOS initialization in `env.darwin.zsh`.
if [[ "$OSTYPE" == darwin* ]]; then
  export HOMEBREW="/opt/homebrew"
  [[ $(uname -m) == "x86_64" ]] && export HOMEBREW="/usr/local"
  [[ -d "$HOMEBREW/sbin" ]] && path=("$HOMEBREW/sbin" $path)
  [[ -d "$HOMEBREW/bin" ]] && path=("$HOMEBREW/bin" $path)
fi
# add ./bin to $PATH
[[ -d "$DOTFILES/bin" ]] && path+=("$DOTFILES/bin")
[[ -d "/opt/bin" ]] && path+=("/opt/bin")
[[ -f "$HOME/.cargo/env" ]] && . "$HOME/.cargo/env"

typeset -gU path

# device-specific env (not tracked by any repo)
[[ -f "$HOME/.zshenv.local" ]] && source "$HOME/.zshenv.local"
