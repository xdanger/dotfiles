" Vim colorscheme generated from Ghostty's Monokai Pro Spectrum palette.

set background=dark
hi clear
if exists('syntax_on')
    syntax reset
endif
let g:colors_name = 'ghostty-monokai-pro-spectrum'

let g:terminal_ansi_colors = [
    \ '#222222', '#fc618d', '#7bd88f', '#fce566',
    \ '#fd9353', '#948ae3', '#5ad4e6', '#f7f1ff',
    \ '#69676c', '#fc618d', '#7bd88f', '#fce566',
    \ '#fd9353', '#948ae3', '#5ad4e6', '#f7f1ff',
    \ ]

function! s:hi(group, fg, bg, attr) abort
    let l:cmd = 'hi ' . a:group
    let l:cmd .= a:fg ==# '' ? ' guifg=NONE ctermfg=NONE' : ' guifg=' . a:fg
    let l:cmd .= a:bg ==# '' ? ' guibg=NONE ctermbg=NONE' : ' guibg=' . a:bg
    let l:cmd .= a:attr ==# '' ? ' gui=NONE cterm=NONE' : ' gui=' . a:attr . ' cterm=' . a:attr
    execute l:cmd
endfunction

call s:hi('Normal',       '#f7f1ff', '#222222', '')
call s:hi('Comment',      '#69676c', '',        'italic')
call s:hi('Constant',     '#948ae3', '',        '')
call s:hi('String',       '#fce566', '',        '')
call s:hi('Character',    '#7bd88f', '',        '')
call s:hi('Number',       '#948ae3', '',        '')
call s:hi('Boolean',      '#fc618d', '',        '')
call s:hi('Identifier',   '#5ad4e6', '',        '')
call s:hi('Function',     '#7bd88f', '',        '')
call s:hi('Statement',    '#fc618d', '',        'bold')
call s:hi('PreProc',      '#fd9353', '',        '')
call s:hi('Type',         '#fce566', '',        '')
call s:hi('Special',      '#5ad4e6', '',        '')
call s:hi('Underlined',   '#5ad4e6', '',        'underline')
call s:hi('Todo',         '#222222', '#fce566', 'bold')

call s:hi('Cursor',       '#222222', '#bab6c0', '')
call s:hi('CursorLine',   '',        '#2c2c2c', '')
call s:hi('CursorLineNr', '#fce566', '#2c2c2c', 'bold')
call s:hi('LineNr',       '#69676c', '',        '')
call s:hi('NonText',      '#69676c', '',        '')
call s:hi('SpecialKey',   '#69676c', '',        '')
call s:hi('EndOfBuffer',  '#222222', '#222222', '')
call s:hi('Visual',       '#f7f1ff', '#525053', '')
call s:hi('Search',       '#222222', '#fce566', '')
call s:hi('IncSearch',    '#222222', '#fd9353', 'bold')
call s:hi('MatchParen',   '#222222', '#5ad4e6', 'bold')

call s:hi('StatusLine',   '#222222', '#bab6c0', '')
call s:hi('StatusLineNC', '#69676c', '#2c2c2c', '')
call s:hi('VertSplit',    '#525053', '#222222', '')
call s:hi('Pmenu',        '#f7f1ff', '#2c2c2c', '')
call s:hi('PmenuSel',     '#222222', '#5ad4e6', 'bold')
call s:hi('PmenuSbar',    '',        '#2c2c2c', '')
call s:hi('PmenuThumb',   '',        '#69676c', '')

call s:hi('DiffAdd',      '#7bd88f', '#243428', '')
call s:hi('DiffChange',   '#fce566', '#363321', '')
call s:hi('DiffDelete',   '#fc618d', '#3a242c', '')
call s:hi('DiffText',     '#222222', '#fce566', 'bold')
call s:hi('SpellBad',     '#fc618d', '',        'underline')
call s:hi('SpellCap',     '#fd9353', '',        'underline')
call s:hi('SpellLocal',   '#5ad4e6', '',        'underline')
call s:hi('SpellRare',    '#948ae3', '',        'underline')

hi! link Terminal Normal
hi! link Directory Identifier
hi! link ErrorMsg Error
hi! link WarningMsg Statement
hi! link MoreMsg String
hi! link Question Function

