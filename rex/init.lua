-- A tmux-flavored flow. Reload with: rex config reload

-- Session picker (tmux prefix + s): j/k move, i searches, x closes (with a
-- y/N confirmation), enter selects, esc leaves search and then quits.
-- The session you are in is selected when the picker opens.
local picker = [[
  LIST="rex ls --json | jq -r '.sessions[] | \"\\(.session_id)\\t\\(.label)\"'"
  export LIST
  IDX=$(eval "$LIST" | awk -F '\t' -v cur="$REX_SESSION" '$1 == cur { print NR; exit }')
  CONFIRM='sh -c '\''printf "Kill session %s? [y/N] " "$1"; read -r a; case "$a" in [yY]) rex session kill "$2";; esac'\'' sh {2} {1}'
  sel=$(eval "$LIST" | fzf --reverse --delimiter='\t' --with-nth=2 --disabled --sync \
    --prompt='session> ' --header='j/k move · i search · x close · enter select · esc quit' \
    --bind "start:pos(${IDX:-1})" \
    --bind 'j:down' \
    --bind 'k:up' \
    --bind 'i:unbind(j,k,x)+enable-search+change-prompt(search> )' \
    --bind 'esc:rebind(j,k,x)+cancel+disable-search+reload<eval "$LIST">+change-prompt(session> )' \
    --bind "x:execute<$CONFIRM>+reload<eval \"\$LIST\">")
  [ -z "$sel" ] || rex do session.select session_id=$(printf '%s' "$sel" | cut -f1) ||
    read -r _
]]

rex.action{
  name  = "pick_session",
  title = "Pick Session",
  run   = function(ctx)
    rex.session.new_layer{
      bounds = { x = 0.18, y = 0.12, w = 0.64, h = 0.55 },
      focus  = true,
      layout = rex.layout.block{
        flavor  = "com.superlogical.terminal.shell",
        options = { command = { "sh", "-c", picker } },
      },
    }
  end,
}
rex.bind("ctrl+b>s", "pick_session")

-- Tabs are tmux windows, with the prefix and by number.
rex.bind("ctrl+b>c", "client.tab.new")

-- Left alt only; right alt types special characters.
-- A key handler can't queue client actions, so ask the app to switch its tab.
local function app_client_id()
  local r = rex.call("client.list")
  for _, c in ipairs(r and r.clients or {}) do
    if c.info and c.info.kind == "app" then return c.client_id end
  end
end

for i = 1, 9 do
  rex.bind("alt+" .. i, function(ctx, ev)
    if ev.mods:find("alt_side", 1, true) then return false end
    local view = rex.session.view{ session_id = ctx.session_id }
    local win = view and view.windows[i]
    local cid = win and (ctx.client_id or app_client_id())
    if cid then
      rex.call("client.perform", {
        client_id = cid,
        action = "session.select",
        args = { session_id = ctx.session_id, window_id = win.window_id },
        origin = "key",
      })
    end
    return true
  end)
end

-- The prefix itself, with tmux's escape hatch.
rex.bind("ctrl+b>ctrl+b", "pane.send_key", { key = "ctrl+b" })
