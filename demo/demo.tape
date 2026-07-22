# VHS tape for the README demo GIF.
# Regenerate from the repo root with:
#   bash demo/setup.sh && vhs demo/demo.tape
Output demo/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 880
Set Height 760
Set Padding 16
Set TypingSpeed 60ms
Set Theme "Catppuccin Mocha"

Hide
Type "cd /tmp/rpvm-demo && export PS1='❯ ' && clear"
Enter
Show

Sleep 800ms
Type "rpvm release"
Sleep 600ms
Enter

# Sync with origin (fetch + rebase)
Sleep 3s

# Global release type: patch -> minor
Down
Sleep 500ms
Enter
Sleep 900ms

# Bump api? no bump -> patch -> minor
Down
Sleep 300ms
Down
Sleep 500ms
Enter
Sleep 900ms

# Bump web? keep "no bump"
Enter

# Summary on screen
Sleep 2s

# Generate release v1.3.0? -> Yes
Enter

Sleep 4s
