# export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles"
export HOMEBREW="/opt/homebrew"
[ `uname -m` = "x86_64" ] && export HOMEBREW="/usr/local"

[ -e "$HOMEBREW/bin/brew" ] || (cat <<EOF && exit 1)
Homebrew is not found. Please install it by:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
EOF

path=("$HOMEBREW/sbin" "$HOMEBREW/bin" $path)
manpath+=("$HOMEBREW/man")

# Google Cloud Platform
if `command -v gcloud &>/dev/null`; then
  export CLOUDSDK_PYTHON="$HOMEBREW/opt/python@3.8/bin/python3"
  export GOOGLE_CLOUD_SDK_HOME="$HOMEBREW/Caskroom/google-cloud-sdk/latest/google-cloud-sdk"
  source "$GOOGLE_CLOUD_SDK_HOME/path.zsh.inc" && source "$GOOGLE_CLOUD_SDK_HOME/completion.zsh.inc"
fi

[ -d /opt/bin ] && path=("/opt/bin" $path)

# Matalab
[ -f /Applications/MATLAB_R2019a.app/bin/matlab ] && alias matlab-cli='/Applications/MATLAB_R2019a.app/bin/matlab -nodisplay -nosplash -nodesktop'

# Java & Android SDK
# export JAVA_HOME="/opt/jdk"
[ -d "/opt/android-sdk" ] && export ANDROID_SDK_ROOT="/opt/android-sdk" && export ANDROID_HOME=$ANDROID_SDK_ROOT

# export GUILE_LOAD_PATH="$HOMEBREW/share/guile/site/3.0"
# export GUILE_LOAD_COMPILED_PATH="$HOMEBREW/lib/guile/3.0/site-ccache"
# export GUILE_SYSTEM_EXTENSIONS_PATH="$HOMEBREW/lib/guile/3.0/extensions"
# export GUILE_TLS_CERTIFICATE_DIRECTORY="/usr/local/etc/gnutls/"
# for dir in "ruby/bin" "openssl@1.1/bin" "coreutils/libexec/gnubin" "gettext/bin" "texinfo/bin" "flutter/bin"; do
#     [ -d "$HOMEBREW/opt/$dir" ] && export PATH="$HOMEBREW/opt/$dir:$PATH"
# done

# Libraries & Flags
export LDFLAGS="-L$HOMEBREW/opt/ruby/lib"
export CPPFLAGS="-I$HOMEBREW/opt/ruby/include"
export PKG_CONFIG_PATH="$HOMEBREW/opt/ruby/lib/pkgconfig"

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/opt/anaconda/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/opt/anaconda/etc/profile.d/conda.sh" ]; then
        . "/opt/anaconda/etc/profile.d/conda.sh"
    else
        path=("/opt/anaconda/bin" $path)
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

function pfd() {
  # present finder directory
  osascript 2>/dev/null <<EOF
  tell application "Finder"
    return POSIX path of (target of first window as text)
  end tell
EOF
}
function cdf() {
  # cd to Finder Directory
  cd "$(pfd)"
}
