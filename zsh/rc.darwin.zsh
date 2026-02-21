# Cursor
[[ -d "/Applications/Cursor.app" ]] && function cursor {
  open -a "/Applications/Cursor.app" "$@"
}

# Matlab
[[ -f /Applications/MATLAB_R2019a.app/bin/matlab ]] && \
  alias matlab-cli='/Applications/MATLAB_R2019a.app/bin/matlab -nodisplay -nosplash -nodesktop'

# pfd & cdf - Finder integration
function pfd() {
  osascript 2>/dev/null <<EOF
  tell application "Finder"
    return POSIX path of (target of first window as text)
  end tell
EOF
}

function cdf() {
  cd "$(pfd)"
}

# Google Cloud completion
if [[ -n "$GOOGLE_CLOUD_SDK_HOME" ]]; then
  source "$GOOGLE_CLOUD_SDK_HOME/completion.zsh.inc"
fi
