""" COLORSCHEME
if (has("termguicolors"))
  set termguicolors
endif
colorscheme gruvbox
hi Normal ctermbg=16 guibg=#000000
hi LineNr ctermbg=16 guibg=#000000
let g:gruvbox_contrast_dark="hard"

""" LIGHTLINE
let g:lightline = { 'colorscheme': 'simpleblack' }

let g:lightline#bufferline#show_number  = 0
let g:lightline#bufferline#shorten_path = 0
let g:lightline#bufferline#unnamed      = '[No Name]'
let g:lightline#bufferline#clickable    = 1

let g:lightline.tabline          = {'left': [['buffers']], 'right': [['close']]}
let g:lightline.component_expand = {'buffers': 'lightline#bufferline#buffers'}
let g:lightline.component_type   = {'buffers': 'tabsel'}
let g:lightline.component_raw    = {'buffers': 1}

""" NERDTREE
let g:NERDTreeDirArrowExpandable = '▸'
let g:NERDTreeDirArrowCollapsible = '▾'
let NERDTreeShowHidden=1
let NERDTreeMinimalUI=1
let NERDTreeDirArrows=1
let NERDTreeShowLineNumbers=1
let NERDTreeMapOpenInTab='\t'

""" TREE SITTER
lua require'nvim-treesitter.configs'.setup { indent = { enable = true }, highlight = { enable = true }, incremental_selection = { enable = true }, textobjects = { enable = true }}

""" TELESCOPE
lua require('telescope').setup{  defaults = { file_ignore_patterns = { "node_modules" }} }

""" LSP CONFIGURATION
lua require('language')
lua require('nvimpairs')
