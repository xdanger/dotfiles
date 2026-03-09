# dotfiles

个人 dotfiles 仓库，用于在多台 macOS、Linux、WSL 和 Codespaces 环境之间统一管理开发环境配置。

## 包含内容

- Zsh 启动文件与交互式配置
- Git 配置、忽略规则和签名校验配置
- Vim、Tmux、Ghostty、Ranger 等常用工具配置
- 基于 [Dotbot](https://github.com/anishathalye/dotbot) 的安装与链接流程
- 安装后的系统依赖引导脚本：`scripts/post-install.sh`

## 安装

### 环境要求

- Git
- Bash
- Zsh
- Linux 或 macOS

### 步骤

```bash
git clone git@github.com:xdanger/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
./install
```

`./install` 会读取 [`install.conf.yaml`](./install.conf.yaml)，并自动执行以下操作：

- 创建必要目录
- 将仓库内配置文件链接到 `HOME`
- 执行 [`scripts/post-install.sh`](./scripts/post-install.sh) 完成平台相关的依赖安装

### 平台说明

- macOS：通过 Homebrew 安装依赖
- Linux：通过 `apt` 安装基础工具；如系统提供 `snap`，还会安装部分额外 CLI 工具
- WSL / Codespaces：安装脚本会自动切换到对应的 Git 配置
- 容器环境：安装脚本会检测容器并跳过宿主机依赖安装

## 仓库结构

- `git/`：Git 相关配置
- `ghostty/`：Ghostty 配置
- `ranger/`：Ranger 配置
- `ruby/`：Ruby 相关配置
- `scripts/`：安装和辅助脚本
- `tmux/`：Tmux 配置
- `vim/`：Vim 配置
- `zsh/`：Zsh 配置
- `dotbot/`：Dotbot 子模块

## 自定义

安装完成后，常见的自定义入口包括：

- `~/.zshrc`
- `~/.gitconfig`
- `~/.tmux.conf`
- `~/.vimrc`

其中，Zsh 配置按启动阶段拆分，便于在多台机器上复用时快速判断该改哪个文件：

- `.zshenv -> .zprofile -> .zshrc -> .zlogin -> .zlogout`
- `~/.zshenv`：所有 Zsh 都会加载，只放全局环境变量，不能有输出
- `~/.zprofile`：login shell 初始化，适合会话级环境准备
- `~/.zshrc`：interactive shell 配置，放 prompt、alias、completion、key bindings 等
- `~/.zlogin`：login shell 在 `.zshrc` 之后执行，适合欢迎信息、启动 `tmux` 等外部命令
- `~/.zlogout`：login shell 退出时的清理逻辑
