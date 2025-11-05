(( ${+LOGINSHELL_INITED} )) && return
LOGINSHELL_INITED=1

# rvm
[ -s "$HOME/.rvm/scripts/rvm" ] && source "$HOME/.rvm/scripts/rvm"
# [ -d "$HOME/.rvm/bin" ] && path+=("$HOME/.rvm/bin")
# virtualenv
[ -d "$HOME/.local/bin" ] && path+=("$HOME/.local/bin")
# Python installations by [uv](https://github.com/astral-sh/uv)
[ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env"
# nvm & node
[ -f "$HOME/.nvm/nvm.sh" ] && export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
# Deno
if [ -d "$HOME/.deno/bin" ]; then
  export DENO_INSTALL="$HOME/.deno"
  path=("$DENO_INSTALL/bin" $path)
fi
# Bun
if [ -d "$HOME/.bun" ]; then
  export BUN_INSTALL="$HOME/.bun" && path+=("$BUN_INSTALL/bin")
  # completion in macOS
  [ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"
fi
# Rust
[ -d "$HOME/.cargo/bin" ] && \. "$HOME/.cargo/env"
# Mise
[ -f "$HOME/.local/bin/mise" ] && eval "$($HOME/.local/bin/mise activate zsh)"
# Platform-specific environment variables
uname=${(L)$(uname -s)}
[ -f "$ZDOTDIR/env.$uname.zsh" ] && source "$ZDOTDIR/env.$uname.zsh"

# reorder_path - 重新排序 $PATH 环境变量
# 排序规则：
#   1. $HOME/.开头的路径（如 ~/.bun, ~/.cargo）
#   2. /opt/homebrew开头的路径
#   3. 其他路径
# 每组内部按字母升序排序

reorder_path() {
  #-------------------------------------
  # ① 准备：去重
  #-------------------------------------
  typeset -gU path                    # 去重 (全局变量, -g)

  #-------------------------------------
  # ② 分组收集路径
  #-------------------------------------
  local -a group1 group2 group3

  for p in $path; do
    if [[ $p == ${HOME}/.* ]]; then
      group1+=$p                      # $HOME/.开头的路径
    elif [[ $p == /opt/homebrew* ]]; then
      group2+=$p                      # /opt/homebrew开头的路径
    else
      group3+=$p                      # 其他路径
    fi
  done

  #-------------------------------------
  # ③ 对每组内部按字母排序
  #-------------------------------------
  group1=(${(o)group1})               # (o) = 按字母升序排序
  group2=(${(o)group2})               # (o) = 按字母升序排序
  group3=(${(o)group3})               # (o) = 按字母升序排序

  #-------------------------------------
  # ④ 重新组装 PATH
  #-------------------------------------
  path=( "${group1[@]}" "${group2[@]}" "${group3[@]}" )
  export PATH                         # 同步回字符串形式
}

# autoload -Uz reorder_path
reorder_path
