# ENV VARIABLES
export ZSH="$HOME/.oh-my-zsh"
export EDITOR="/opt/homebrew/bin/nvim"
export PATH=$PATH:~/.local/bin:~/.yarn/bin/:/Library/TeX/texbin/
export GOPATH=$HOME/.go
export PROMPT_EOL_MARK=''

# THEME
ZSH_THEME="arrow"

# OH MY ZSH
source $ZSH/oh-my-zsh.sh

# PLUGINS
plugins=(git)
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
source ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ALIASES
source ~/.config/zsh/aliases

# FNM
eval "$(fnm env --use-on-cd)"

# TMUX
[[ $TERM != "screen" ]] && exec tmux -f ~/.config/tmux/tmux.conf

#THIS MUST BE AT THE END OF THE FILE FOR SDKMAN TO WORK!!!
export SDKMAN_DIR="$HOME/.sdkman"
[[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"

# SYNTAX HIGHLIGHTING COLORS
ZSH_HIGHLIGHT_STYLES[suffix-alias]=fg=blue,underline
ZSH_HIGHLIGHT_STYLES[precommand]=fg=blue,underline
ZSH_HIGHLIGHT_STYLES[arg0]=fg=blue