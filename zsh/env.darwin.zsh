export HOMEBREW="/opt/homebrew"
[[ $(uname -m) == "x86_64" ]] && export HOMEBREW="/usr/local"

if [[ ! -e "$HOMEBREW/bin/brew" ]]; then
  print "Homebrew is not found. Please install it by:"
  print '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  return 1
fi

path=("$HOMEBREW/sbin" "$HOMEBREW/bin" $path)
manpath+=("$HOMEBREW/man")

# SSH auth agent
# Alternative: route through the 1Password agent instead of the system one —
#   export SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
#
# GUI (Aqua) login sessions inherit SSH_AUTH_SOCK from launchd automatically.
# Non-GUI sessions (e.g. `ssh` in with `ForwardAgent no`) don't — so reattach to
# the very same launchd-managed agent, making its already-loaded keys usable
# here too. The launchd socket path changes every boot, so resolve it
# dynamically: try launchctl first (fast, works on some setups), then fall back
# to locating the agent's `Listeners` socket via lsof.
if [[ -z "$SSH_AUTH_SOCK" ]] || ! /usr/bin/ssh-add -l >/dev/null 2>&1; then
  _agent_sock=$(launchctl getenv SSH_AUTH_SOCK 2>/dev/null)
  [[ -S "$_agent_sock" ]] || \
    _agent_sock=$(lsof -aUc ssh-agent -u "$(id -un)" 2>/dev/null | awk '/Listeners$/{print $NF; exit}')
  [[ -S "$_agent_sock" ]] && export SSH_AUTH_SOCK="$_agent_sock"
  unset _agent_sock
fi
# Load Apple-keychain-stored keys into the agent (no-op if already present).
/usr/bin/ssh-add --apple-use-keychain 2>/dev/null

# Google Cloud Platform
if (( $+commands[gcloud] )); then
  export CLOUDSDK_PYTHON="$HOMEBREW/bin/python3"
  export GOOGLE_CLOUD_SDK_HOME="$HOMEBREW/share/google-cloud-sdk"
  source "$GOOGLE_CLOUD_SDK_HOME/path.zsh.inc"
fi

# Ruby
export LDFLAGS="-L$HOMEBREW/opt/ruby/lib"
export CPPFLAGS="-I$HOMEBREW/opt/ruby/include"
export PKG_CONFIG_PATH="$HOMEBREW/opt/ruby/lib/pkgconfig"
for dir in "ruby" "openssl" "gettext" "texinfo" "flutter"; do
  [[ -d "$HOMEBREW/opt/$dir/bin" ]] && path=("$HOMEBREW/opt/$dir/bin" $path)
done
if (( $+commands[ruby] )); then
  for pth in $(ruby -e 'puts Gem.path'); do
    [[ -d "$pth" ]] && path=("$pth/bin" $path)
  done
fi

# Added by OrbStack: command-line tools and integration
if [[ -d "$HOME/.orbstack" ]]; then
  source "$HOME/.orbstack/shell/init.zsh" 2>/dev/null || :
fi

# Java & Android SDK
[[ -d "$HOMEBREW/opt/openjdk" ]] && export JAVA_HOME="$HOMEBREW/opt/openjdk" && path=("$JAVA_HOME/bin" $path)
[[ -d "/opt/android-sdk" ]] && export ANDROID_SDK_ROOT="/opt/android-sdk" && export ANDROID_HOME="$ANDROID_SDK_ROOT"

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
if [[ -d "$HOMEBREW/anaconda3" ]]; then
  __conda_setup="$("$HOMEBREW/anaconda3/bin/conda" 'shell.zsh' 'hook' 2>/dev/null)"
  if [[ $? -eq 0 ]]; then
    eval "$__conda_setup"
  else
    if [[ -f "$HOMEBREW/anaconda3/etc/profile.d/conda.sh" ]]; then
      source "$HOMEBREW/anaconda3/etc/profile.d/conda.sh"
    else
      path=("$HOMEBREW/anaconda3/bin" $path)
    fi
  fi
  unset __conda_setup
fi
# <<< conda initialize <<<

# taobao-native CLI
if [[ -d "$HOME/Library/Application Support/taobao/cli" ]]; then
  export TBN_CLI_BIN="/Users/xdanger/Library/Application Support/taobao/cli/bin"
fi

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
path=("$PNPM_HOME" $path)
