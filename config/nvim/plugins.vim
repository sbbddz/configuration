call plug#begin('~/.vim/plugged')
""" Fuzzy finder
Plug 'nvim-lua/plenary.nvim' 
Plug 'nvim-telescope/telescope.nvim'

""" IDE
Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/nvim-cmp'
Plug 'L3MON4D3/LuaSnip'
Plug 'windwp/nvim-autopairs'
Plug 'halkn/lightline-lsp'
Plug 'mattn/emmet-vim'

""" Appearance
Plug 'itchyny/lightline.vim'
Plug 'mengelbrecht/lightline-bufferline'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
Plug 'morhetz/gruvbox'

""" Syntax Utilities 
Plug 'lukas-reineke/indent-blankline.nvim'
Plug 'maxmellon/vim-jsx-pretty'

""" Utilities
Plug 'preservim/nerdtree'
Plug 'easymotion/vim-easymotion'
call plug#end()
