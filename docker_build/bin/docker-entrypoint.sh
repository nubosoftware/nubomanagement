#!/bin/sh

# entry point for nubo docker add all needed commands here

LOGFILE="/opt/nubomanagement/docker_apps/docker-entrypoint.log"
# copy static files
rsync -a /opt/nubomanagement/static-image/ /opt/nubomanagement/static-src/ >> ${LOGFILE} 2>&1

# run upgrade script
#if [ "${1}" -eq 'supervisord' ]; then
  cd /opt/nubomanagement
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
#fi

echo "Running command: $@" >> ${LOGFILE} 2>&1
exec "$@"
