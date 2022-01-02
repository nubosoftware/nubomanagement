#!/bin/bash

# entry point for nubo docker add all needed commands here

cd /opt/nubomanagement


sudo /usr/bin/node dist/upgrade.js
if [ $? -eq 0 ] 
then 
  echo "Successfully run update" 
else 
  echo "Upgrade failed. Trying again in 20 seconds..";
  sleep 20
  sudo /usr/bin/node dist/upgrade.js
fi

cd -
exec "$@"
