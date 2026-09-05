# Stable entry points for shells and services without interactive mise hooks.
typeset -gU path
[[ -d "$HOME/.local/bin" ]] && path=("$HOME/.local/bin" "${path[@]}")
[[ -d "${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}/shims" ]] &&
  path=("${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}/shims" "${path[@]}")
export PATH
