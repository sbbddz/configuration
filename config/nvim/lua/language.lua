local cmp = require'cmp'
local cmp_autopairs = require('nvim-autopairs.completion.cmp')

cmp.setup {
  snippet = {
    expand = function(args)
      require('luasnip').lsp_expand(args.body)
    end,
  },
  mapping = {
    ['<C-b>'] = cmp.mapping(cmp.mapping.scroll_docs(-4), { 'i', 'c' }),
    ['<C-f>'] = cmp.mapping(cmp.mapping.scroll_docs(4), { 'i', 'c' }),
    ['<C-Space>'] = cmp.mapping(cmp.mapping.complete(), { 'i', 'c' }),
    ['<C-y>'] = cmp.config.disable, 
    ['<C-e>'] = cmp.mapping({
      i = cmp.mapping.abort(),
      c = cmp.mapping.close(),
    }),
    ['<CR>'] = cmp.mapping.confirm({ select = true }),
  },
  sources = {
    { name = "nvim_lsp"},
    { name = "path" },
    { name = "buffer" , keyword_length = 5},
    { name = "luasnip" },
  },
  experimental = {
    ghost_text = true
  }
}

cmp.event:on( 'confirm_done', cmp_autopairs.on_confirm_done({  map_char = { tex = '' } }))
cmp_autopairs.lisp[#cmp_autopairs.lisp+1] = "racket"

require'lspconfig'.pyright.setup{}
require'lspconfig'.tsserver.setup{}
require'lspconfig'.gopls.setup{}
