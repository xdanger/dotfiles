# dotfiles

个人 dotfiles 仓库，用于统一管理 macOS、Linux、WSL 和 Codespaces 下的开发环境配置。

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
- Linux：通过 `apt` 安装基础工具，并依赖 `snap` 安装部分额外 CLI 工具
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
