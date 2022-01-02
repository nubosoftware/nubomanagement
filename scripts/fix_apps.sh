#!/bin/bash
if [ $# -ne 2 ]; then
	echo "Wrong count of arguments"
	echo "Usage: sudo fix_apps <user's dir> <path to packages.list>"
	echo "Example fix_apps nubosoftware.com/alexander@nubosoftware.com/359548040264496 ."
	echo "to get packages.list run: adb pull /data/system/packages.list"
	exit 1
fi
FOLDER=$1
PATH2LIST=$2/packages.list

if [ ! -f ${PATH2LIST} ] ; then
	echo "ERROR: ${PATH2LIST} does not exist"
	exit 1
fi

echo "FOLDER: ${FOLDER} PATH2LIST:${PATH2LIST}"

cat ${PATH2LIST} | \
while read line; do
#	echo "${line}"
	APP=`echo ${line} | awk '{print $1}'`
	OWNER=`echo ${line} | awk '{print $2}'`
#	echo "${APP} ${OWNER}"
	while [ ${#OWNER} -lt 5 ] ; do
		OWNER=0${OWNER}
#		echo ${OWNER}
	done
	if [ -d ${FOLDER}/${APP} ] ; then
		chown 1${OWNER}.1${OWNER} -R ${FOLDER}/${APP}
#	else
#		echo "${APP} of owner ${OWNER} doesn't exist, make dir"
#		mkdir -m 700 ${FOLDER}/${APP}
#		chown 1${OWNER}.1${OWNER} ${FOLDER}/${APP}
	fi
done

if [ -d ${FOLDER}/android ]; then
	chown 101000.101000 -R ${FOLDER}/android
fi

