# zsh startup order:
#   .zshenv -> [.zprofile if login] -> [.zshrc if interactive]
#   -> [.zlogin if login] -> [.zlogout on exit]
# 4. .zlogin: loaded for login shells, after .zshrc.
# Only run external commands here; avoid mutating the shell environment.
