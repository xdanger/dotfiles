# zsh startup order:
#   .zshenv -> [.zprofile if login] -> [.zshrc if interactive]
#   -> [.zlogin if login] -> [.zlogout on exit]
# 2. .zprofile: loaded for login shells, before .zshrc.
# Put session-level initialization here, such as version managers and agents.
# This repo intentionally splits responsibilities between .zprofile and .zlogin.
#
# /etc/zprofile may reorder PATH even when this session was already initialized.
source "$ZDOTDIR/mise-path.zsh"
(( ${+LOGINSHELL_INITED} )) && return
LOGINSHELL_INITED=1

# Platform-specific environment variables
local os_name=${(L)$(uname -s)}
[[ -f "$ZDOTDIR/env.$os_name.zsh" ]] && source "$ZDOTDIR/env.$os_name.zsh"

# Android SDK
if [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  [[ -d "$ANDROID_HOME/platform-tools" ]] && path=("$ANDROID_HOME/platform-tools" $path)
  [[ -d "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin" ]] && path+=("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin")
fi
# Preserve PATH activation order from version managers such as mise/uv.
typeset -gU path
source "$ZDOTDIR/mise-path.zsh"

if [[ "$OSTYPE" == linux* ]] && (( $+commands[keychain] )); then
  # SSH 登录且 ForwardAgent 注入的 agent 可连通（ssh-add rc 0/1）时直接复用；
  # 否则（本地会话或未转发，rc 2）交给 keychain 启动/复用本机 agent
  if [[ -z "$SSH_CONNECTION" ]] || { ssh-add -l &>/dev/null; (( $? == 2 )) }; then
    eval "$(keychain --eval --quiet)"
  fi
fi
