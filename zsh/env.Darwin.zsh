if type brew &>/dev/null; then
  export HOMEBREW=`brew --prefix`
else
  echo "Homebrew is not found.\n"
  exit 1
fi

path+=("$HOMEBREW/sbin" "$HOMEBREW/bin")
manpath+=("$HOMEBREW/man")

# Google Cloud Platform
if `command -v gcloud &>/dev/null`; then
  export CLOUDSDK_PYTHON="$HOMEBREW/bin/python3"
  export GOOGLE_CLOUD_SDK_HOME="$HOMEBREW/share/google-cloud-sdk"
  source "$GOOGLE_CLOUD_SDK_HOME/path.zsh.inc" && source "$GOOGLE_CLOUD_SDK_HOME/completion.zsh.inc"
fi

# Ruby
export LDFLAGS="-L$HOMEBREW/opt/ruby/lib"
export CPPFLAGS="-I$HOMEBREW/opt/ruby/include"
export PKG_CONFIG_PATH="$HOMEBREW/opt/ruby/lib/pkgconfig"
for dir in "ruby" "openssl" "gettext" "texinfo" "flutter"; do
    [ -d "$HOMEBREW/opt/$dir/bin" ] && path=("$HOMEBREW/opt/$dir/bin" $path)
done
for pth in `ruby -e 'puts Gem.path'`; do
  [ -d "$pth" ] && path=("$pth/bin" $path)
done

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# Added by OrbStack: command-line tools and integration
if [ -d "$HOME/.orbstack" ]; then
  source "$HOME/.orbstack/shell/init.zsh" 2>/dev/null || :
fi

# Cursor
[ -d "/Applications/Cursor.app" ] && function cursor {
    open -a "/Applications/Cursor.app" "$@"
}

# Matalab
[ -f /Applications/MATLAB_R2019a.app/bin/matlab ] && alias matlab-cli='/Applications/MATLAB_R2019a.app/bin/matlab -nodisplay -nosplash -nodesktop'

# Java & Android SDK
[ -d "$HOMEBREW/opt/openjdk" ] && export JAVA_HOME="$HOMEBREW/opt/openjdk" && path=("$JAVA_HOME/bin" $path)
[ -d "/opt/android-sdk" ] && export ANDROID_SDK_ROOT="/opt/android-sdk" && export ANDROID_HOME=$ANDROID_SDK_ROOT

# export GUILE_LOAD_PATH="$HOMEBREW/share/guile/site/3.0"
# export GUILE_LOAD_COMPILED_PATH="$HOMEBREW/lib/guile/3.0/site-ccache"
# export GUILE_SYSTEM_EXTENSIONS_PATH="$HOMEBREW/lib/guile/3.0/extensions"
# export GUILE_TLS_CERTIFICATE_DIRECTORY="/usr/local/etc/gnutls/"


# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$("$HOMEBREW/anaconda3/bin/conda" 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "$HOMEBREW/anaconda3/etc/profile.d/conda.sh" ]; then
        . "$HOMEBREW/anaconda3/etc/profile.d/conda.sh"
    else
        export PATH="$HOMEBREW/anaconda3/bin:$PATH"
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

autoload -Uz compinit
fpath+=("$(brew --prefix)/share/zsh/site-functions")
compinit -i
