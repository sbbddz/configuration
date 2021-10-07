""" LEADER
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
nnoremap gtf <C-w>gf
nnoremap <leader>l gt
nnoremap <leader>h gT

""" FUZZY FINDER
nnoremap <leader>ff :Telescope find_files<cr>

""" COC MAPS
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

""" NERDTREE
map <leader>nt :NERDTreeFind<CR>
