""" SETS
set number
set relativenumber
set visualbell
set guicursor=
set tabstop=2 softtabstop=2
set shiftwidth=2
set expandtab
set autoindent
set noswapfile
set nobackup
set scrolloff=8
set mouse=a
set nowrap
set nohlsearch
set noerrorbells
set encoding=utf-8
set hidden
set cmdheight=2
set updatetime=300
set shortmess+=c
set path+=**
set wildmenu
set scrolloff=8
set showtabline=2

" Always show the signcolumn, otherwise it would shift the text each time
" diagnostics appear/become resolved.
if has("nvim-0.5.0") || has("patch-8.1.1564")
    " Recently vim can merge signcolumn and number column into one
    set signcolumn=number
else
    set signcolumn=yes
endif
