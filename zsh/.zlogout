# zsh startup order:
#   .zshenv -> [.zprofile if login] -> [.zshrc if interactive]
#   -> [.zlogin if login] -> [.zlogout on exit]
# 5. .zlogout: loaded when a login shell exits.
# Use this file for cleanup work before the session ends.
