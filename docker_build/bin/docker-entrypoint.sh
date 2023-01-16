#!/bin/bash

# entry point for nubo docker add all needed commands here
mkdir -p /opt/nubomanagement/docker_apps
LOGFILE="/opt/nubomanagement/docker_apps/docker-entrypoint.log"

echo "Starting entrypoint. cmd: $1" >> ${LOGFILE} 2>&1


# run upgrade script
if [ "$1" == "supervisord" ]; then
  cd /opt/nubomanagement
  echo "Copying static files" >> ${LOGFILE} 2>&1
  # copy static files
  rsync -a /opt/nubomanagement/static-image/ /opt/nubomanagement/static-src/ >> ${LOGFILE} 2>&1

  echo "Running upgrade script" >> ${LOGFILE} 2>&1
  sudo node dist/upgrade.js >> ${LOGFILE} 2>&1
  if [ $? -eq 0 ]
  then
    echo "Successfully run update" >> ${LOGFILE} 2>&1
  else
    echo "Upgrade failed. Trying again in 20 seconds.." >> ${LOGFILE} 2>&1
    sleep 20
    sudo node dist/upgrade.js >> ${LOGFILE} 2>&1
  fi
  cd -
fi

echo "Running command: $@" >> ${LOGFILE} 2>&1
exec "$@"
