#!/usr/bin/env bash
# bootstrap_git_system_config.sh
# 系统级 Git + Git-LFS 基线，一次执行即可。

set -euo pipefail

run_sys() {  # root 或 sudo 写 /etc/gitconfig
  if [ "$(id -u)" -eq 0 ]; then
    git config --system "$@"
  else
    sudo git config --system "$@"
  fi
}

# 注册 LFS 过滤器到系统层
if [ "$(id -u)" -eq 0 ]; then
  git lfs install --system
else
  sudo git lfs install --system
fi

# ---- 1. Git 基线 ---------------------------------------------------------
run_sys core.autocrlf false
run_sys core.safecrlf true
run_sys core.eol lf
run_sys core.filemode false
run_sys color.ui auto
run_sys init.defaultBranch main
run_sys push.default simple
run_sys fetch.prune true
run_sys fetch.pruneTags true
run_sys fetch.parallel 4
run_sys gc.auto 256
run_sys gc.writeCommitGraph true
run_sys merge.conflictStyle diff3
run_sys rebase.autoStash true
run_sys advice.detachedHead false
run_sys advice.statusHints false
run_sys safe.directory "/workspace"

# ---- 2. Git-LFS 调优 -----------------------------------------------------
run_sys lfs.concurrenttransfers 8     # 并行数
run_sys lfs.transfer.maxretries 6     # 最大重试次数
run_sys lfs.transfer.maxretrydelay 30 # 指数退避封顶秒数
run_sys lfs.fetchrecentalways true    # clone 时预拉近 7 天
run_sys lfs.fetchrecentrefsdays 7
run_sys lfs.pruneoffsetdays 30        # 仅保留 30 天内未引用对象
