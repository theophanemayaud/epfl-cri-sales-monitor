to connect to ssh running in vm listening to localhost
putty.exe -ssh username@localhost -pw mypassword -m "sshcommands.txt" -t

need a file sshcommands.txt with
/bin/bash ; othercommandsthatyouwant
