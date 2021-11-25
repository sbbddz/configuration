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

""" BUFFERS CONTROL
nnoremap <leader>T :enew<cr> :e 
nnoremap <A-l> :bnext<cr>
nnoremap <A-h> :bprevious<cr>
nnoremap <leader>bq :w<cr>:bp <BAR> bd #<cr>
nnoremap <leader>bl :ls<cr>

""" WINDOW CONTROL
nnoremap <leader>l <C-w>l
nnoremap <leader>h <C-w>h

""" TELECOSPE
nnoremap <leader>ff :Telescope find_files<cr>
nnoremap <C-p> :lua require('telescope.builtin').buffers()<CR>
nnoremap <C-f> :lua require('telescope.builtin').git_files()<CR>

""" LSP MAPS
nmap <silent> gd :lua vim.lsp.buf.definition()<CR>
nmap <silent> gi :lua vim.lsp.buf.implementation()<CR>
nmap <silent> gr :lua vim.lsp.buf.references()<CR>
nmap <leader>do :lua vim.lsp.buf.code_action()<CR>
nmap <leader>bf :lua vim.lsp.buf.formatting()<CR>

""" NERDTREE
nnoremap <leader>nt :NERDTreeFind<CR>
nnoremap <leader>nf :NERDTreeFocus<CR>

""" EASYMOTION
nmap <leader>s <Plug>(easymotion-s2)
