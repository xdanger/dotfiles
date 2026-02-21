# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

DISABLE_UNTRACKED_FILES_DIRTY="true"
HIST_STAMPS="yyyy/mm/dd"

ZSH_TMUX_AUTOSTART="false"
ZSH_TMUX_ITERM2="true"
# 把 oh-my-zsh 的 custom 独立出来，避免嵌套
export ZSH_CUSTOM="$ZDOTDIR/oh-my-custom"
ZSH_THEME="powerlevel10k/powerlevel10k"
# To customize prompt, run `p10k configure` or edit $DOTFILES/zsh/p10k.zsh.
[[ ! -f $ZDOTDIR/p10k.zsh ]] || source $ZDOTDIR/p10k.zsh
# p10k 使用的 gitstatus 使用的 gitlib2 不支持 git 中 worktree 等 extentions 特性
# see https://github.com/xdanger/dotfiles/issues/2
POWERLEVEL9K_DISABLE_GITSTATUS=true

# zsh-completions (add fpath before oh-my-zsh's compinit)
if [[ -n "$HOMEBREW" ]]; then
  fpath+=("$HOMEBREW/share/zsh-completions" "$HOMEBREW/share/zsh/site-functions")
fi

source "$ZSH/oh-my-zsh.sh"

(( $+commands[rsync] ))         && alias rsync="rsync --exclude '.DS_Store'"
(( $+commands[rclone] ))        && alias rclone="rclone --exclude-from $DOTFILES/rclone/exclude-list.txt"
(( $+commands[bat] ))           && alias cat='bat --paging never'
(( $+commands[prettyping] ))    && alias ping='prettyping --nolegend'
(( $+commands[htop] ))          && alias top='sudo htop'
(( $+commands[diff-so-fancy] )) && alias diff='diff-so-fancy'
(( $+commands[tldr] ))          && alias help='tldr'
(( $+commands[podman] ))        && alias docker='podman'
(( $+commands[jira] ))          && eval "$(jira --completion-script-bash)"
if (( $+commands[aria2c] )); then
  extargs="-ci --external-downloader aria2c --external-downloader-args aria2c:'-s16 -x16 -k 4M' -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]' --write-sub --sub-lang 'en,zh-CN,zh-Hans,zh-TW,zh-Hant' --convert-subs 'srt' --restrict-filenames -o '%(playlist)s/%(playlist_index)05d.%(title)s.%(id)s.%(ext)s'"
  (( $+commands[youtube-dl] )) && alias youtube-dl="youtube-dl $extargs"
  (( $+commands[yt-dlp] ))     && alias yt-dlp="yt-dlp $extargs"
fi

[[ -f "$ZDOTDIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]] && \
  source "$ZDOTDIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
if [[ $TERM_PROGRAM == "iTerm.app" ]] && [[ -f "$ZDOTDIR/iterm2_shell_integration.zsh" ]]; then
  source "$ZDOTDIR/iterm2_shell_integration.zsh"
fi

# 判断是不是 WSL
is_wsl() {
  [[ -f "/proc/sys/fs/binfmt_misc/WSLInterop" ]] && return 0
  [[ -n ${WSL_DISTRO_NAME:-} ]] && return 0
  return 1
}
if is_wsl; then
  alias ssh="ssh.exe"
  export WSL=true
else
  unset WSL
fi

[[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"

# Bun completion
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"

# Platform-specific interactive config
local os_name=${(L)$(uname -s)}
[[ -f "$ZDOTDIR/rc.$os_name.zsh" ]] && source "$ZDOTDIR/rc.$os_name.zsh"

# direnv
(( $+commands[direnv] )) && eval "$(direnv hook zsh)"

# OpenClaw Completion
[[ -f "$HOME/.openclaw/completions/openclaw.zsh" ]] && source "$HOME/.openclaw/completions/openclaw.zsh"
