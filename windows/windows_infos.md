to connect to ssh running in vm listening to localhost
putty.exe -ssh username@localhost -pw mypassword -m "sshcommands.txt" -t

need a file sshcommands.txt with
/bin/bash ; othercommandsthatyouwant

start virtualbox vm named Debian, headless windows 10
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" startvm "Debian" --type headless
