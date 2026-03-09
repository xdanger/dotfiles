(( ${+LOGINSHELL_INITED} )) && return
LOGINSHELL_INITED=1

# rvm
[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm"
# virtualenv
[[ -d "$HOME/.local/bin" ]] && path+=("$HOME/.local/bin")
# Python installations by [uv](https://github.com/astral-sh/uv)
[[ -f "$HOME/.local/bin/env" ]] && source "$HOME/.local/bin/env"
# nvm & node
[[ -f "$HOME/.nvm/nvm.sh" ]] && export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
# Deno
if [[ -d "$HOME/.deno/bin" ]]; then
  export DENO_INSTALL="$HOME/.deno"
  path=("$DENO_INSTALL/bin" $path)
fi
# Bun
if [[ -d "$HOME/.bun" ]]; then
  export BUN_INSTALL="$HOME/.bun" && path+=("$BUN_INSTALL/bin")
fi
# Mise
(( $+commands[mise] )) && eval "$(mise activate zsh)"
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
# Preserve PATH activation order from version managers such as mise/nvm/uv.
typeset -gU path

if [[ "$OSTYPE" == linux* ]] && [[ -f ~/.ssh/langley ]] && (( $+commands[keychain] )); then
  # 强制用 keychain 自己的 agent（覆盖 ForwardAgent 注入的转发 socket）
  eval "$(keychain --eval --agents ssh --noask langley)"
fi
