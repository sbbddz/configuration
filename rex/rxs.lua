-- Rex-specific sessionizer actions used by rxs / tms -rx.
-- The tmux-flavored session picker stays in init.lua.

local HOME  = os.getenv("HOME")
local SHELL = "com.superlogical.terminal.shell"
local ROOTS = { "Code", "Documents", "Work", "Repos", "Projects" }
local WORK  = HOME .. "/.tms.work"

local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function expand(path)
  if path == "~" then return HOME end
  if path:sub(1, 2) == "~/" then return HOME .. path:sub(2) end
  return path
end

local function pretty(path)
  if path == HOME then return "~" end
  if path:sub(1, #HOME + 1) == HOME .. "/" then
    return "~" .. path:sub(#HOME + 1)
  end
  return path
end

local function base_of(dir)
  dir = dir:gsub("/+$", "")
  return dir:match("([^/]+)$") or dir
end

local function name_of(dir)
  return (base_of(dir):gsub("%.", "_"))
end

local function list_sessions()
  local r, err = rex.call("session.list")
  if err then error(err, 0) end
  return r.sessions or {}
end

local function index_sessions(sessions)
  local by_label = {}
  for _, s in ipairs(sessions) do
    by_label[s.label] = by_label[s.label] or s.session_id
  end
  return by_label
end

local function ensure_session(dir, by_label)
  local name = name_of(dir)
  if by_label[name] then return by_label[name] end

  local r, err = rex.call("session.create", {
    label = name,
    initial_windows = { {
      layout = rex.layout.block{
        flavor  = SHELL,
        options = { cwd = dir },
      },
    } },
  })
  if err then error(err, 0) end

  by_label[name] = r.session_id
  return r.session_id
end

local function select_session(id)
  rex.client.queue("session.select", { session_id = id })
end

local function detail_for(id, ctx)
  if not id then return "new" end
  if id == ctx.session_id then return "current" end
  return "open"
end

local function project_dirs()
  local argv = { "find" }
  for _, root in ipairs(ROOTS) do argv[#argv + 1] = HOME .. "/" .. root end
  argv[#argv + 1] = "-mindepth"
  argv[#argv + 1] = "1"
  argv[#argv + 1] = "-maxdepth"
  argv[#argv + 1] = "1"
  argv[#argv + 1] = "-type"
  argv[#argv + 1] = "d"

  local r, err = rex.exec(argv)
  if not r then error(err, 0) end

  local dirs = {}
  for dir in (r.stdout or ""):gmatch("[^\n]+") do
    if base_of(dir):sub(1, 1) ~= "." then dirs[#dirs + 1] = dir end
  end
  table.sort(dirs)
  return dirs
end

local function work_dirs()
  local f, err = io.open(WORK, "r")
  if not f then return nil, err end

  local dirs, seen = {}, {}
  for raw in f:lines() do
    local line = trim(raw)
    if line ~= "" and line:sub(1, 1) ~= "#" then
      line = expand(line)
      if not seen[line] then
        seen[line] = true
        dirs[#dirs + 1] = line
      end
    end
  end
  f:close()
  return dirs
end

rex.action{
  name     = "pick_project",
  title    = "Open Project",
  category = "Sessions",
  keywords = "rxs tms project directory sessionizer",
  run = function(ctx)
    local by_label = index_sessions(list_sessions())
    local dirs = project_dirs()
    local items = {}

    for _, dir in ipairs(dirs) do
      local id = by_label[name_of(dir)]
      items[#items + 1] = {
        id       = dir,
        title    = base_of(dir),
        subtitle = pretty(dir),
        icon     = "folder",
        detail   = detail_for(id, ctx),
      }
    end

    if #items == 0 then error("no project directories found", 0) end

    local dir = rex.ui.pick{
      title       = "Open Project",
      placeholder = "Search projects",
      items       = items,
    }
    if dir == nil then return end

    select_session(ensure_session(dir, by_label))
  end,
}

rex.action{
  name     = "pick_work",
  title    = "Open Work Sessions",
  category = "Sessions",
  keywords = "rxs tms work",
  run = function(ctx)
    local dirs, err = work_dirs()
    if not dirs then error(err, 0) end
    if #dirs == 0 then error("~/.tms.work has no directories", 0) end

    local by_label = index_sessions(list_sessions())
    local items = {}
    for _, dir in ipairs(dirs) do
      items[#items + 1] = {
        id       = dir,
        title    = base_of(dir),
        subtitle = pretty(dir),
        icon     = "folder",
        detail   = detail_for(by_label[name_of(dir)], ctx),
        selected = true,
      }
    end

    local chosen = rex.ui.pick{
      title       = "Work Sessions",
      placeholder = "Filter work sessions",
      confirm     = "Open",
      multiple    = true,
      items       = items,
    }
    if chosen == nil or #chosen == 0 then return end

    local first
    for _, dir in ipairs(chosen) do
      local id = ensure_session(dir, by_label)
      first = first or id
    end
    select_session(first)
  end,
}

rex.action{
  name     = "open_session",
  title    = "Open Project Directory",
  category = "Sessions",
  keywords = "rxs tms project directory",
  args     = { dir = "string" },
  run = function(_, args)
    local dir = expand(trim(args.dir))
    if dir == "" then error("a directory is required", 0) end
    select_session(ensure_session(dir, index_sessions(list_sessions())))
  end,
}
