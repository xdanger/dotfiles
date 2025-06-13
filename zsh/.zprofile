(( ${+LOGINSHELL_INITED} )) && return
LOGINSHELL_INITED=1

#
[ -f "$ZDOTDIR/env.`uname`.zsh" ] && source "$ZDOTDIR/env.`uname`.zsh"
