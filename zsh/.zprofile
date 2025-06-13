(( ${+LOGINSHELL_INITED} )) && return
LOGINSHELL_INITED=1

#
[ -f "$ZDOTDIR/os.`uname`.zsh" ] && source "$ZDOTDIR/os.`uname`.zsh"
