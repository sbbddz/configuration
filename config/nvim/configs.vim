""" COC
if has('nvim') 
  inoremap <silent><expr> <c-space> coc#refresh() 
else 
  inoremap <silent><expr> <c-@> coc#refresh() 
endif

set statusline^=%{coc#status()}%{get(b:,'coc_current_function','')}
let g:coc_global_extensions = [
      \ 'coc-tsserver'
      \ ]

nmap <leader>do <Plug>(coc-codeaction)

""" COLORSCHEME
if (has("termguicolors"))
  set termguicolors
endif
colorscheme ayu 
let ayucolor="dark"
hi Normal ctermbg=16 guibg=#000000
hi LineNr ctermbg=16 guibg=#000000

""" LIGHTLINE
let g:lightline = {
      \ 'colorscheme': 'simpleblack',
      \ 'active': {
        \   'left': [ [ 'mode', 'paste' ],
        \             [ 'cocstatus', 'readonly', 'filename', 'modified' ] ]
        \ },
        \ 'component_function': {
          \   'cocstatus': 'coc#status'
          \ },
          \ }

let g:lightline#bufferline#show_number  = 1
let g:lightline#bufferline#shorten_path = 0
let g:lightline#bufferline#unnamed      = '[No Name]'
let g:lightline#bufferline#clickable    = 1

let g:lightline.tabline          = {'left': [['buffers']], 'right': [['close']]}
let g:lightline.component_expand = {'buffers': 'lightline#bufferline#buffers'}
let g:lightline.component_type   = {'buffers': 'tabsel'}
let g:lightline.component_raw    = {'buffers': 1}

""" VIMWIKI (Note taking)
let g:vimwiki_list = [{'path': '~/Repos/notes/',
      \ 'path_html': '~/Repos/notes/public_html',
      \ 'syntax': 'markdown', 'ext': '.md'}]
let g:vimwiki_dir_link = 'index'

""" NERDTREE
let g:NERDTreeDirArrowExpandable = '▸'
let g:NERDTreeDirArrowCollapsible = '▾'
let NERDTreeMinimalUI=1
let NERDTreeDirArrows=1
let NERDTreeShowLineNumbers=1
let NERDTreeMapOpenInTab='\t'

""" LUA CONFIG
lua require('nvim-autopairs').setup{}
lua require('nvimpairs')

""" TREE SITTER
lua require'nvim-treesitter.configs'.setup { indent = { enable = false }, highlight = { enable = true }, incremental_selection = { enable = true }, textobjects = { enable = true }}

""" FIX PYTHON INDENTATION ERROR
let g:pyindent_open_paren=0
