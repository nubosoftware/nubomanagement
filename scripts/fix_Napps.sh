#!/bin/bash
if [ $# -eq 0 ]; then
	echo "Wrong count of arguments"
	echo "Usage: sudo fix_apps <user's dir> <path to packages.list>"
	echo "Example fix_apps nubosoftware.com/alexander@nubosoftware.com/359548040264496 ."
	echo "to get packages.list run: adb pull /data/system/packages.list"
	exit 1
fi
FOLDER=$1
UNUM=$2

if [ "${UNUM}" == "" ] ; then
	UNUM=1
fi

echo "FOLDER: ${FOLDER} UNUM:${UNUM}"
LSOUT=`ls -ln ${FOLDER}/misc/profiles/cur`

echo "$LSOUT" | \
while read line; do
	APP=`echo ${line} | awk '{print $9}'`
	OWNER=`echo ${line} | awk '{print $3}'`
	if [ ${#OWNER} -gt 5 ]; then
		OWNER=`echo "$OWNER" | sed "s/.*\([0-9]\{5\}$\)/${UNUM}\1/"`
	fi
	echo "${APP} ${OWNER}"
	chown ${OWNER}.${OWNER} -R ${FOLDER}/misc/profiles/cur/${APP}
done

LSOUT=`ls -ln ${FOLDER}/user`

echo "$LSOUT" | \
while read line; do
	APP=`echo ${line} | awk '{print $9}'`
	OWNER=`echo ${line} | awk '{print $3}'`
	if [ ${#OWNER} -gt 5 ]; then
		OWNER=`echo "$OWNER" | sed "s/.*\([0-9]\{5\}$\)/${UNUM}\1/"`
	fi
	echo "${APP} ${OWNER}"
	chown ${OWNER}.${OWNER} -R ${FOLDER}/user/${APP}
done

LSOUT=`ls -ln ${FOLDER}/user_de`

echo "$LSOUT" | \
while read line; do
	APP=`echo ${line} | awk '{print $9}'`
	OWNER=`echo ${line} | awk '{print $3}'`
	if [ ${#OWNER} -gt 5 ]; then
		OWNER=`echo "$OWNER" | sed "s/.*\([0-9]\{5\}$\)/${UNUM}\1/"`
	fi
	echo "${APP} ${OWNER}"
	chown ${OWNER}.${OWNER} -R ${FOLDER}/user_de/${APP}
done

