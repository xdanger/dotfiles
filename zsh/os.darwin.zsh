# macOS terminal / shell integrations.
# Sourced from .zshrc for interactive shells (see the platform-specific block there).

# iTerm2 shell integration
if [[ $TERM_PROGRAM == "iTerm.app" ]] && [[ -f "$ZDOTDIR/iterm2_shell_integration.zsh" ]]; then
  source "$ZDOTDIR/iterm2_shell_integration.zsh"
fi

# Otty terminal shell integration (inert unless launched by Otty, which sets $OTTY_SHELL_INTEGRATION)
if [[ -n "$OTTY_SHELL_INTEGRATION" ]] && [[ -r "$OTTY_SHELL_INTEGRATION/otty-integration.zsh" ]]; then
  source "$OTTY_SHELL_INTEGRATION/otty-integration.zsh"
fi
