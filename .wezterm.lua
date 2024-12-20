local wezterm = require("wezterm")

local config = wezterm.config_builder()

-- COLORSCHEME
config.colors = {
	foreground = '#ececec',
	background = '#191919',
	cursor_bg = '#c0caf5',
	cursor_fg = '#1a1b26',
	cursor_border = '#1a1b26',
	selection_bg = '#33467c',
	selection_fg = '#c0caf5',
	ansi = {
		'#191919',
		'#f7768e',
		'#9ece6a',
		'#e0af68',
		'#7aa2f7',
		'#bb9af7',
		'#7dcfff',
		'#ececec',
	},
	brights = {
		'#191919',
		'#f7768e',
		'#9ece6a',
		'#e0af68',
		'#7aa2f7',
		'#bb9af7',
		'#7dcfff',
		'#ececec',
	},
}

-- FONT
config.font = wezterm.font('Iosevka Nerd Font', { weight = 'Medium' })
config.font_size = 18

-- TABS
config.use_fancy_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.enable_tab_bar = false

-- WINDOW PADDINGS
config.window_padding = { left = 1, right = 1, top = 1, bottom = 1 }

-- USE WSL IN WINDOWS AND TABS FOR CMD/PWSH
if wezterm.target_triple == 'x86_64-pc-windows-msvc' then
	config.use_fancy_tab_bar = false
	config.default_domain = "WSL:Ubuntu"
	config.enable_tab_bar = true
	config.hide_tab_bar_if_only_one_tab = false
	config.launch_menu = {
		{
			label = "wsl",
			args = { "wsl.exe" },
			domain = { DomainName = "local" },
		},
		{
			label = "pwsh",
			args = { "C:\\Program Files\\PowerShell\\7\\pwsh.exe", "-nologo" },
			domain = { DomainName = "local" },
		}
	}
	
	-- Enable CTRL+T in windows
	config.keys = {
		{
			key = 't',
			mods = 'CTRL|SHIFT',
			action = wezterm.action.ShowLauncher
		},
	}
else
	-- DISABLE DEFAULT KEYBINDINGS
	config.keys = {
		{
			key = 't',
			mods = 'SUPER',
			action = wezterm.action.DisableDefaultAssignment
		},
	}
end

return config
