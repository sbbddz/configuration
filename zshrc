################
# ==== EXPORTS
################

export ZSH="$HOME/.oh-my-zsh"
export EDITOR=$(which nvim)
export PROMPT_EOL_MARK=''
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#787878"
export ANDROID_HOME=/Users/samuel/Library/Android/sdk

## PATH
export PATH=$PATH:~/.local/bin:~/.yarn/bin/:/usr/local/
export PATH=$PATH:/Users/samuel/Library/Android/sdk/platform-tools
export PATH=/opt/homebrew/opt/llvm/bin:$PATH # use llvm path from homebrew

################
# ==== OH-MY-ZSH
################

export ZSH_THEME="arrow"
source $ZSH/oh-my-zsh.sh 
plugins=(git) 

################
# ==== SOURCES
################

source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh

################
# ==== HISTORY CONFIG
################
# See: https://registerspill.thorstenball.com/p/which-command-did-you-run-1731-days

export HISTFILE=$HOME/.zsh_history
HISTSIZE=10000000
SAVEHIST=10000000

setopt INC_APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_SAVE_NO_DUPS
setopt SHARE_HISTORY

################
# ==== DEV ENVIRONMENTS
################

## DOCKER
# source /Users/samuel/.docker/init-zsh.sh || true # Added by Docker Desktop

## OCAML (OPAM)
[[ ! -r /Users/samuel/.opam/opam-init/init.zsh ]] || source /Users/samuel/.opam/opam-init/init.zsh  > /dev/null 2> /dev/null

## JAVA (SDKMAN)
export SDKMAN_DIR="$HOME/.sdkman"
[[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"

## JAVASCRIPT (FNM)
eval "$(fnm env --use-on-cd)"

## TYPESCRIPT / JAVASCRIPT (DENO)
export DENO_INSTALL="/Users/samuel/.deno"
export PATH=$PATH:$DENO_INSTALL/bin
. "/Users/samuel/.deno/env"

## RUST (CARGO)
. "$HOME/.cargo/env"

## HASKELL (GHC)
[ -f "/Users/samuel/.ghcup/env" ] && . "/Users/samuel/.ghcup/env" # ghcup-env

## C# DOTNET (DOTNET CLI)
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_ROOT=~/.dotnet
export PATH=$PATH:~/.dotnet

# GO
export GOPATH=$HOME/.go
export PATH=$PATH:$GOPATH/bin

# MISE (right now, ruby)
eval "$(~/.local/bin/mise activate)"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

################
# ==== EXTENSIONS
################
eval "$(zoxide init zsh)"

################
# ==== FUNCTIONS
################

cfhelp() {
	echo "----- ALIAS"
	echo "cfvim: Open vim configuration"
	echo "cfzsh: Open zsh configuration"
	echo "cftmux: Open tmux configuration"
	echo "cfalias: Open aliases configuration"
	echo "cfscripts: Open scripts configuration"

	echo "----- SCRIPTS"
	echo $(ls -a ~/.local/bin)
}

n() {
	if ! [ -x "$(command -v fd)" ]; then
		cd "$(find "${HOME}" -type d -not -path '*/.*' | fzf)"
	else
		cd "$(fd . "${HOME}" "${HOME}/Library/Mobile Documents/com~apple~CloudDocs" --exclude '/Library/' --type d --color never | fzf)"
	fi
}

colors() {
	for i in {0..255}; do
		printf "\x1b[38;5;${i}mcolour${i}\x1b[0m\n"
	done
}

hist() {
	cat ~/.zsh_history | awk -F ';' '{ $1=$2; print }' | fzf
}

edit() {
	fzf | xargs nvim
}

cheat() {
	curl cheat.sh/$1
}

################
# ==== ALIAS
################

## EDITORS
alias v="nvim"
alias vi="nvim"
alias vim="nvim"
alias cat="bat"

## LS
alias ls="eza"
alias l="eza -laG"

## Zoxide
alias cd="z"

## DIRS & FILES
alias cfvim="cd ~/.config/nvim/ && nvim ."
alias cfzsh="nvim ~/.config/zsh/zshrc && . ~/.zshrc"
alias cftmux="nvim ~/.config/tmux/tmux.conf"
alias cfalias="nvim ~/.config/zsh/aliases && . ~/.zshrc"
alias cfscripts="cd ~/.local/bin"

## OS SPECIFIC
if uname -s | grep -q Darwin ; then
	alias cficloud="cd \"/Users/$(echo $USER)/Library/Mobile Documents/com~apple~CloudDocs\""
	alias cfnotes="open -a Notes"
else
	alias cfnotes="nvim ~/.notes/"
fi
