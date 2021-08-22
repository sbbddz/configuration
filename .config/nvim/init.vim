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

""" PLUGINS
call plug#begin('~/.vim/plugged')
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'
call plug#end()

""" REMAPS (mode lhs rhs)
let mapleader = " "

nnoremap <c-c> <esc>
onoremap <c-c> <esc>
inoremap <c-c> <esc>
vnoremap <c-c> <esc>

nnoremap <leader>e :tabedit<Space>
nnoremap <leader>c :tabclose<cr>
nnoremap <A-l> gt
nnoremap <A-h> gT

nnoremap <leader>ff :Telescope find_files<cr>
