call plug#begin('~/.vim/plugged')
""" Fuzzy finder
Plug 'nvim-lua/plenary.nvim'
Plug 'nvim-telescope/telescope.nvim'

""" Autocomplete
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'mattn/emmet-vim'

""" Appareance
Plug 'ayu-theme/ayu-vim'
Plug 'itchyny/lightline.vim'

""" Utilities
Plug 'vimwiki/vimwiki'
Plug 'preservim/nerdtree'
call plug#end()
