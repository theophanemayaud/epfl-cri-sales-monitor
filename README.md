# Developpment infos

## Colors

italic : Message in reaction to user input

### Text color

Yellow : useful info said rarely
White : info that's just routine, said often
Red : error messages
Green : messages when there is a notable success after an announced trial message ( ex after "will do this" must either be green -> success, red -> failure)

### Background color

bgBlue : debugging, finding stuff, noticing better...

# Troubleshooting

## Debian

On debian, after some time had the problem of network is unreachable error
did "sudo nano etc/network/interfaces"
remplaced allow-hotplug by auto
then restarted newtork with : sudo /etc/init.d/networking restart
