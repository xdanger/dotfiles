" Vim colorscheme generated from Ghostty's Monokai Pro Light Sun palette.

set background=light
hi clear
if exists('syntax_on')
    syntax reset
endif
let g:colors_name = 'ghostty-monokai-pro-light-sun'

let g:terminal_ansi_colors = [
    \ '#f8efe7', '#ce4770', '#218871', '#b16803',
    \ '#d4572b', '#6851a2', '#2473b6', '#2c232e',
    \ '#a59c9c', '#ce4770', '#218871', '#b16803',
    \ '#d4572b', '#6851a2', '#2473b6', '#2c232e',
    \ ]

function! s:hi(group, fg, bg, attr) abort
    let l:cmd = 'hi ' . a:group
    let l:cmd .= a:fg ==# '' ? ' guifg=NONE ctermfg=NONE' : ' guifg=' . a:fg
    let l:cmd .= a:bg ==# '' ? ' guibg=NONE ctermbg=NONE' : ' guibg=' . a:bg
    let l:cmd .= a:attr ==# '' ? ' gui=NONE cterm=NONE' : ' gui=' . a:attr . ' cterm=' . a:attr
    execute l:cmd
endfunction

call s:hi('Normal',       '#2c232e', '#f8efe7', '')
call s:hi('Comment',      '#a59c9c', '',        'italic')
call s:hi('Constant',     '#6851a2', '',        '')
call s:hi('String',       '#b16803', '',        '')
call s:hi('Character',    '#218871', '',        '')
call s:hi('Number',       '#6851a2', '',        '')
call s:hi('Boolean',      '#ce4770', '',        '')
call s:hi('Identifier',   '#2473b6', '',        '')
call s:hi('Function',     '#218871', '',        '')
call s:hi('Statement',    '#ce4770', '',        'bold')
call s:hi('PreProc',      '#d4572b', '',        '')
call s:hi('Type',         '#b16803', '',        '')
call s:hi('Special',      '#2473b6', '',        '')
call s:hi('Underlined',   '#2473b6', '',        'underline')
call s:hi('Todo',         '#f8efe7', '#b16803', 'bold')

call s:hi('Cursor',       '#f8efe7', '#72696d', '')
call s:hi('CursorLine',   '',        '#eee4dc', '')
call s:hi('CursorLineNr', '#ce4770', '#eee4dc', 'bold')
call s:hi('LineNr',       '#a59c9c', '',        '')
call s:hi('NonText',      '#a59c9c', '',        '')
call s:hi('SpecialKey',   '#a59c9c', '',        '')
call s:hi('EndOfBuffer',  '#f8efe7', '#f8efe7', '')
call s:hi('Visual',       '#2c232e', '#beb5b3', '')
call s:hi('Search',       '#f8efe7', '#b16803', '')
call s:hi('IncSearch',    '#f8efe7', '#d4572b', 'bold')
call s:hi('MatchParen',   '#f8efe7', '#2473b6', 'bold')

call s:hi('StatusLine',   '#f8efe7', '#72696d', '')
call s:hi('StatusLineNC', '#72696d', '#eee4dc', '')
call s:hi('VertSplit',    '#beb5b3', '#f8efe7', '')
call s:hi('Pmenu',        '#2c232e', '#eee4dc', '')
call s:hi('PmenuSel',     '#f8efe7', '#2473b6', 'bold')
call s:hi('PmenuSbar',    '',        '#eee4dc', '')
call s:hi('PmenuThumb',   '',        '#a59c9c', '')

call s:hi('DiffAdd',      '#218871', '#e5f2df', '')
call s:hi('DiffChange',   '#b16803', '#f2e6d3', '')
call s:hi('DiffDelete',   '#ce4770', '#f1dce2', '')
call s:hi('DiffText',     '#f8efe7', '#b16803', 'bold')
call s:hi('SpellBad',     '#ce4770', '',        'underline')
call s:hi('SpellCap',     '#d4572b', '',        'underline')
call s:hi('SpellLocal',   '#2473b6', '',        'underline')
call s:hi('SpellRare',    '#6851a2', '',        'underline')

hi! link Terminal Normal
hi! link Directory Identifier
hi! link ErrorMsg Error
hi! link WarningMsg Statement
hi! link MoreMsg String
hi! link Question Function

