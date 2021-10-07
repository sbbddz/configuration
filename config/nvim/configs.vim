""" COC
if has('nvim')
    inoremap <silent><expr> <c-space> coc#refresh()
else
    inoremap <silent><expr> <c-@> coc#refresh()
endif

set statusline^=%{coc#status()}%{get(b:,'coc_current_function','')}

inoremap <silent><expr> <TAB>
            \ pumvisible() ? "\<C-n>" :
            \ <SID>check_back_space() ? "\<TAB>" :
            \ coc#refresh()
inoremap <expr><S-TAB> pumvisible() ? "\<C-p>" : "\<C-h>"

function! s:check_back_space() abort
    let col = col('.') - 1
    return !col || getline('.')[col - 1]  =~# '\s'
endfunction

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
let NERDTreeQuitOnOpen=1
let NERDTreeMapOpenInTab='\t'
