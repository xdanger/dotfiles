# dotfiles

个人 dotfiles 配置，用于管理 macOS 系统的配置文件和开发环境设置。

## 用途

这些 dotfiles 用于快速配置新的开发环境，确保开发体验的一致性和高效性。它使用 [dotbot](https://github.com/anishathalye/dotbot) 作为安装工具，自动完成链接配置文件、创建必要目录以及执行自定义脚本等任务。

## 功能特点

- Zsh 配置（使用 Oh My Zsh 和精选插件）
- Vim 配置（包含常用插件和配色方案）
- Tmux 配置（含 tpm 插件管理器）
- Git 配置（含别名、忽略规则和验证签名设置）
- macOS 特定优化

## 使用方法

### 环境要求

- Git
- Zsh
- Vim
- Tmux

### 安装步骤

1. 克隆仓库到本地：

```bash
git clone https://github.com/yourusername/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
```

2. 运行安装程序：

```bash
./install
```

安装程序会根据 `install.conf.yaml` 中的配置自动执行以下操作：

- 创建必要的目录
- 链接配置文件到指定位置
- 执行 `script/post-install.bash` 脚本完成其他初始化工作

### 自定义配置

安装完成后，可以根据个人喜好修改以下文件：

- `~/.zshrc` - Zsh 配置
- `~/.vimrc` - Vim 配置
- `~/.tmux.conf` - Tmux 配置
- `~/.gitconfig` - Git 配置

## 目录结构

- `git/` - Git 相关配置
- `vim/` - Vim 相关配置
- `zsh/` - Zsh 相关配置
- `tmux/` - Tmux 相关配置
- `script/` - 安装后执行的脚本
- `dotbot/` - dotbot 安装工具

## 路线图

- ✅ 基础配置文件管理
- ✅ 使用 dotbot 自动化安装
- ✅ Zsh、Vim、Tmux 配置
- ⏳ 添加更多 macOS 特定优化
- ⏳ 支持更多开发环境和工具
- ⏳ 提供主题和样式自定义选项

## 下一步行动项

1. 增加更全面的系统优化脚本
2. 添加容器化开发环境支持
3. 改进文档，添加更多自定义配置示例
4. 增加环境检测和自适应配置
