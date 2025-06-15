#!/usr/bin/env bash
set -euo pipefail

### ------------------------------------------------------------
### 1. 系统级 Git 基线（无用户信息）
###    写入 /etc/gitconfig
### ------------------------------------------------------------
sudo git config --system core.autocrlf false
sudo git config --system core.safecrlf true
sudo git config --system core.eol lf
sudo git config --system core.filemode false
sudo git config --system color.ui auto
sudo git config --system init.defaultBranch main
sudo git config --system push.default simple
sudo git config --system fetch.prune true
sudo git config --system fetch.pruneTags true
sudo git config --system fetch.parallel 4
sudo git config --system gc.auto 256
sudo git config --system gc.writeCommitGraph true
sudo git config --system merge.conflictStyle diff3
sudo git config --system rebase.autoStash true
sudo git config --system advice.detachedHead false
sudo git config --system advice.statusHints false
sudo git config --system safe.directory "/workspace"   # 按需调整

### ------------------------------------------------------------
### 2. 系统级 Git-LFS 设置
### ------------------------------------------------------------
# 把 LFS 过滤器注册到 /etc/gitconfig
sudo git lfs install --system --skip-repo

# 性能与稳健性调优
sudo git config --system lfs.concurrenttransfers 8          # 并行数
sudo git config --system lfs.transfer.maxretries 6          # 最大重试次数
sudo git config --system lfs.transfer.maxretrydelay 30      # 指数退避封顶秒数
sudo git config --system lfs.fetchrecentalways true         # clone 时预拉近 7 天
sudo git config --system lfs.fetchrecentrefsdays 7
sudo git config --system lfs.pruneoffsetdays 30             # 仅保留 30 天内未引用对象

echo "✅ System-level Git & Git-LFS configuration completed."
