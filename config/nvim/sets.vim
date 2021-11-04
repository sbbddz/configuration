""" SETS
set number
set relativenumber
set visualbell
set tabstop=4 softtabstop=4
set shiftwidth=4
set expandtab
set tabstop=2 
set shiftwidth=2
set expandtab
set noswapfile
set smartindent
set nobackup
set scrolloff=8
set mouse=a
set nowrap
set hlsearch
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
set nohlsearch

if has("nvim-0.5.0") || has("patch-8.1.1564")
    set signcolumn=number
else
    set signcolumn=yes
endif
