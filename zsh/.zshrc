# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

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

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
#plugins=(macos git node python)
# Do not enable the following (incompatible to Pure) plugins: vi-mode, virtualenv.

# User configuration

ZSH_TMUX_AUTOSTART="false"
ZSH_TMUX_ITERM2="true"
# Set theme to [pure](https://github.com/sindresorhus/pure)
# fpath+=$ZDOTDIR/pure
# autoload -U promptinit; promptinit; prompt pure
# 把 oh-my-zsh 的 custom 独立出来，避免嵌套
export ZSH_CUSTOM="$ZDOTDIR/oh-my-custom"
ZSH_THEME="powerlevel10k/powerlevel10k"
# To customize prompt, run `p10k configure` or edit $DOTFILES/zsh/p10k.zsh.
[[ ! -f $ZDOTDIR/p10k.zsh ]] || source $ZDOTDIR/p10k.zsh
# p10k 使用的 gitstatus 使用的 gitlib2 不支持 git 中 worktree 等 extentions 特性
# see https://github.com/xdanger/dotfiles/issues/2
POWERLEVEL9K_DISABLE_GITSTATUS=true

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

# 更兼容 bash，把带空格的字符串中的空格当做数组的分隔符
# 不兼容 warp，注释掉一下
# setopt shwordsplit

command -v rsync &>/dev/null         && alias rsync="rsync --exclude '.DS_Store'"
command -v rclone &>/dev/null        && alias rclone="rclone --exclude-from $DOTFILES/rclone/exclude-list.txt"
command -v bat &>/dev/null           && alias cat='bat --paging never'
command -v prettyping &>/dev/null    && alias ping='prettyping --nolegend'
command -v htop &>/dev/null          && alias top='sudo htop'
command -v diff-so-fancy &>/dev/null && alias diff='diff-so-fancy'
# command -v ncdu &>/dev/null          && alias du='ncdu --color dark -rr -x'
command -v tldr &>/dev/null          && alias help='tldr'
command -v podman &> /dev/null       && alias docker='podman'
command -v jira &>/dev/null          && eval "$(jira --completion-script-bash)"
if [ `command -v aria2c` ]; then
  extargs="-ci --external-downloader aria2c --external-downloader-args aria2c:'-s16 -x16 -k 4M' -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]' --write-sub --sub-lang 'en,zh-CN,zh-Hans,zh-TW,zh-Hant' --convert-subs 'srt' --restrict-filenames -o '%(playlist)s/%(playlist_index)05d.%(title)s.%(id)s.%(ext)s'"
  command -v youtube-dl &>/dev/null && alias youtube-dl="youtube-dl $extargs"
  command -v yt-dlp &>/dev/null && alias yt-dlp="yt-dlp $extargs"
fi

source "$ZDOTDIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
if [[ $TERM_PROGRAM != "iTerm.app" ]]; then
  source "$ZDOTDIR/iterm2_shell_integration.zsh"
fi

# 判断是不是 WSL
is_wsl() {
  [[ -f "/proc/sys/fs/binfmt_misc/WSLInterop" ]] && return 0
  # [[ $(<"/proc/sys/kernel/osrelease") == *[Mm]icrosoft* ]] && return 0
  [[ -n ${WSL_DISTRO_NAME:-} ]] && return 0
  return 1
}
if is_wsl; then
  alias ssh="ssh.exe"
  export WSL=true
else
  unset WSL
fi

# zsh-completions
if type brew &>/dev/null; then
  fpath+=("$(brew --prefix)/share/zsh-completions")
  autoload -Uz compinit
  compinit
fi
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
