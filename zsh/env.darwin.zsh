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
#if [[ -z "$SSH_TTY" ]]; then
#  export SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
#fi
SSH_AUTH_SOCK=$(launchctl getenv SSH_AUTH_SOCK) /usr/bin/ssh-add --apple-use-keychain 2>/dev/null

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

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
path=("$PNPM_HOME" $path)
