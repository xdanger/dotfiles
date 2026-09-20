# Neovim

LazyVim configuration copied from the current system, including plugin versions,
Neo-tree, clipboard integration, transparency, and the Tokyo Night theme.

## Install on another device

Back up any existing `~/.config/nvim` before running the repository's `./install`.
The installer links this directory to `~/.config/nvim`; `mise/global.toml` already
includes `neovim = "latest"`, which provides the `nvim` command.

Open `nvim` with network access to bootstrap lazy.nvim and install plugins. Run
`:Lazy restore` to restore the versions recorded in `lazy-lock.json`. Use a Nerd
Font in your terminal for icons. Language servers and other external tools are
installed separately by Mason or the system package manager as needed.

The theme is a regular file, not a symlink into Omarchy, so other devices do not
need Omarchy installed. Omarchy theme changes on the source machine will not
automatically update this snapshot. The clipboard uses OSC 52 in SSH, tmux, and
detected Herdr sessions, with Wayland clipboard integration when available;
other sessions retain Neovim's default clipboard detection.

Plugin downloads, caches, undo files, and sessions are not included.
