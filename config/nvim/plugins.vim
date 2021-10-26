call plug#begin('~/.vim/plugged')
""" Fuzzy finder
Plug 'nvim-lua/plenary.nvim' 
Plug 'nvim-telescope/telescope.nvim'

""" Autocomplete
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'mattn/emmet-vim'

""" Appearance
Plug 'itchyny/lightline.vim'
Plug 'mengelbrecht/lightline-bufferline'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
Plug 'drewtempelmeyer/palenight.vim'

""" Syntax Utilities 
Plug 'windwp/nvim-autopairs'
Plug 'lukas-reineke/indent-blankline.nvim'
Plug 'maxmellon/vim-jsx-pretty'

""" Utilities
Plug 'vimwiki/vimwiki'
Plug 'preservim/nerdtree'
Plug 'easymotion/vim-easymotion'
call plug#end()
