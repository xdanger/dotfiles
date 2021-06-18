# First of all, get absolute realpath of this dotfiles repo
# The following block is for zsh
SOURCE=${(%):-%N}
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DOTFILES="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
# The following block is for bash
# SOURCE="${BASH_SOURCE[0]}"
# while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
#   DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
#   SOURCE="$(readlink "$SOURCE")"
#   [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
# done
# DOTFILES="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"

# Path to your oh-my-zsh installation.
export ZSH=$DOTFILES/oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
#ZSH_THEME="kennethreitz"
ZSH_THEME=""
# Set theme to [pure](https://github.com/sindresorhus/pure)
fpath+=$DOTFILES/pure
autoload -U promptinit; promptinit; prompt pure

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion. Case
# sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment the following line to disable bi-weekly auto-update checks.
# DISABLE_AUTO_UPDATE="true"

# Uncomment the following line to change how often to auto-update (in days).
# export UPDATE_ZSH_DAYS=13

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# The optional three formats: "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
HIST_STAMPS="yyyy/mm/dd"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(osx git ruby rake rails bundler node gcloud)

# User configuration

source $ZSH/oh-my-zsh.sh

# You may need to manually set your language environment
export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vi'
else
  export EDITOR='vim'
fi

# Compilation flags
export ARCHFLAGS="-arch `uname -m`"

# ssh
# export SSH_KEY_PATH="~/.ssh/id_rsa"

# 更兼容 bash，把带空格的字符串中的空格当做数组的分隔符
setopt shwordsplit

# antigen
[ -d "$DOTFILES/antigen" ] && source $DOTFILES/antigen/antigen.zsh
# fzf
[ -d "$DOTFILES/fzf" ] && path+=("$DOTFILES/fzf/bin") \
  && source "$DOTFILES/fzf/shell/completion.zsh" 2> /dev/null \
  && source "$DOTFILES/fzf/shell/key-bindings.zsh" \
  && export FZF_DEFAULT_OPTS="--bind='ctrl-o:execute(atom {})+abort'"
# rvm
[ -d "$HOME/.rvm/bin" ] && path+=("$HOME/.rvm/bin")
# other envs
[ -f "$DOTFILES/zshrc.`uname`" ] && source "$DOTFILES/zshrc.`uname`"
[ -f "$DOTFILES/../.dotlocal/envs.zsh" ]   && source "$DOTFILES/../.dotlocal/envs.zsh"
# add ./bin to $PATH
path=("$DOTFILES/bin" $path)

command -v bat &>/dev/null           && alias cat='bat --paging never'
command -v prettyping &>/dev/null    && alias ping='prettyping --nolegend'
command -v htop &>/dev/null          && alias top='sudo htop'
command -v diff-so-fancy &>/dev/null && alias diff='diff-so-fancy'
command -v ncdu &>/dev/null          && alias du='ncdu --color dark -rr -x'
command -v tldr &>/dev/null          && alias help='tldr'
command -v youtube-dl &>/dev/null    && alias youtube-dl="youtube-dl -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]' --write-sub --sub-lang 'zh-CN,zh-Hans,zh-TW,zh-Hant,en' --convert-subs 'srt' -o '%(uploader)s/%(playlist)s/%(playlist_index)03d.%(title)s.%(id)s.%(ext)s'"
command -v jira &>/dev/null          && eval "$(jira --completion-script-bash)"

source "$DOTFILES/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
source "$DOTFILES/iterm2_shell_integration.zsh"
