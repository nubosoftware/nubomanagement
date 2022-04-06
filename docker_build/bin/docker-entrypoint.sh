#!/bin/bash

# entry point for nubo docker add all needed commands here


echo "cmd: ${1}"
#if [ "${1}" -eq 'supervisord' ]; then
  cd /opt/nubomanagement
  sudo node dist/upgrade.js
  if [ $? -eq 0 ]
  then
    echo "Successfully run update"
  else
    echo "Upgrade failed. Trying again in 20 seconds..";
    sleep 20
    sudo node dist/upgrade.js
  fi
  cd -
#fi

exec "$@"
