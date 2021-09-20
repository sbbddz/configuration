""" SETS
set number
set relativenumber
set ruler
set visualbell
set guicursor=
set tabstop=4 softtabstop=4
set shiftwidth=4
set expandtab
set smartindent
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

" Always show the signcolumn, otherwise it would shift the text each time
" diagnostics appear/become resolved.
if has("nvim-0.5.0") || has("patch-8.1.1564")
    " Recently vim can merge signcolumn and number column into one
    set signcolumn=number
else
    set signcolumn=yes
endif

""" PLUGINS
call plug#begin('~/.vim/plugged')
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
call plug#end()

""" REMAPS (mode lhs rhs)
let mapleader = " "

""" SAVE WITH CONTROL + S
nnoremap <c-s> :w<cr>
onoremap <c-s> :w<cr>
inoremap <c-s> :w<cr>
vnoremap <c-s> :w<cr>

""" NORMAL MODE WITH CONTROL + C
nnoremap <c-c> <esc>
onoremap <c-c> <esc>
inoremap <c-c> <esc>
vnoremap <c-c> <esc>

""" TAB CONTROL
nnoremap <leader>e :tabedit<Space>
nnoremap <leader>c :tabclose<cr>
nnoremap <A-l> gt
nnoremap <A-h> gT

""" FUZZY FINDER
nnoremap <leader>ff :Telescope find_files<cr>

""" COC
if has('nvim')
    inoremap <silent><expr> <c-space> coc#refresh()
else
    inoremap <silent><expr> <c-@> coc#refresh()
endif
