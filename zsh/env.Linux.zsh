# Google Cloud SDK
if [ -d "$HOME/.local/google-cloud-sdk" ]; then
  export GOOGLE_CLOUD_SDK_HOME="$HOME/.local/google-cloud-sdk"
  source "$GOOGLE_CLOUD_SDK_HOME/path.zsh.inc" && source "$GOOGLE_CLOUD_SDK_HOME/completion.zsh.inc"
  # if `command -v uv python list &>/dev/null`; then
  #   export CLOUDSDK_PYTHON="$(which python)"
  # fi
fi
# Java & Android SDK
[ -d "$HOME/.local/openjdk" ] && export JAVA_HOME="$HOME/.local/openjdk" && path=("$JAVA_HOME/bin" $path)
[ -d "$HOME/.local/android-sdk-tools" ] && export ANDROID_HOME="$HOME/.local/android-sdk-tools"
