# export HOMEBREW_BOTTLE_DOMAIN="https://mirrors.ustc.edu.cn/homebrew-bottles"
export HOMEBREW="/opt/homebrew"
[ `uname -m` = "x86_64" ] && export HOMEBREW="/usr/local"

[ -e "$HOMEBREW/bin/brew" ] || (cat <<EOF && exit 1)
Homebrew is not found. Please install it by:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
EOF

path=("$HOMEBREW/sbin" "$HOMEBREW/bin" $path)
[ -d "/opt/bin" ] && path+=("/opt/bin")
manpath+=("$HOMEBREW/man")

for dir in "ruby" "openssl" "gettext" "texinfo" "flutter"; do
    [ -d "$HOMEBREW/opt/$dir/bin" ] && path=("$HOMEBREW/opt/$dir/bin" $path)
done
# for dir in "coreutils/libexec/gnubin"; do
#     [ -d "$HOMEBREW/opt/$dir" ] && path+="($HOMEBREW/opt/$dir)"
# done

# Google Cloud Platform
if `command -v gcloud &>/dev/null`; then
  export CLOUDSDK_PYTHON="$HOMEBREW/bin/python3"
  export GOOGLE_CLOUD_SDK_HOME="$HOMEBREW/share/google-cloud-sdk"
  source "$GOOGLE_CLOUD_SDK_HOME/path.zsh.inc" && source "$GOOGLE_CLOUD_SDK_HOME/completion.zsh.inc"
fi

# Python
# [ -d "$HOMEBREW/opt/python" ] && path=("$HOMEBREW/opt/python/bin" $path)

# Rust
[ -d "$HOME/.cargo/bin" ] && path+=("$HOME/.cargo/bin")

# Matalab
[ -f /Applications/MATLAB_R2019a.app/bin/matlab ] && alias matlab-cli='/Applications/MATLAB_R2019a.app/bin/matlab -nodisplay -nosplash -nodesktop'

# Java & Android SDK
[ -d "/opt/jdk" ] && export JAVA_HOME="/opt/jdk" && path=("$JAVA_HOME/bin" $path)
[ -d "/opt/android-sdk" ] && export ANDROID_SDK_ROOT="/opt/android-sdk" && export ANDROID_HOME=$ANDROID_SDK_ROOT

# export GUILE_LOAD_PATH="$HOMEBREW/share/guile/site/3.0"
# export GUILE_LOAD_COMPILED_PATH="$HOMEBREW/lib/guile/3.0/site-ccache"
# export GUILE_SYSTEM_EXTENSIONS_PATH="$HOMEBREW/lib/guile/3.0/extensions"
# export GUILE_TLS_CERTIFICATE_DIRECTORY="/usr/local/etc/gnutls/"


# Libraries & Flags
export LDFLAGS="-L$HOMEBREW/opt/ruby/lib"
export CPPFLAGS="-I$HOMEBREW/opt/ruby/include"
export PKG_CONFIG_PATH="$HOMEBREW/opt/ruby/lib/pkgconfig"

# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/opt/homebrew/anaconda3/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/opt/homebrew/anaconda3/etc/profile.d/conda.sh" ]; then
        . "/opt/homebrew/anaconda3/etc/profile.d/conda.sh"
    else
        export PATH="/opt/homebrew/anaconda3/bin:$PATH"
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
