#!/bin/bash

# Script must be run in management dir
# $1 apk file (full path)
# $2 path for img files (full path)

# Error handling
function error_exit
{
	echo "$1" 1>&2
	# Delete temp <package>.apk
	if [ -n "$APK" ]; then
		echo "Reached 1 APK=$APK"
		rm -f $APK
	fi

	# Delete apktool/<package>
	if [ -n "$APKTOOL_DIR" ]; then
		echo "Reached 2 APKTOOL_DIR=$APKTOOL_DIR"
		rm -rf $APKTOOL_DIR
	fi

	# Delete apktool/tmp
	if [ -n "$APKTOOL_TMP" ]; then
		echo "Reached 2 APKTOOL_TMP=$APKTOOL_TMP"
		rm -rf $APKTOOL_TMP
	fi

	# Delete html/player/tmp
	rm -rf $TMP_RESOURCE_DIR

	exit -1
}

unset APK
unset APKTOOL_DIR
unset APKTOOL_TMP

ORIG_APK=`echo $(cd $(dirname "$1") && pwd -P)/$(basename "$1")`
EXTRES_DIR="$2"

if [ -z ${EXTRES_DIR} ]; then
    error_exit "Resources home path cannot been empty"
fi

if [ ! -d ${EXTRES_DIR} ]; then
    error_exit "Resources home path does not exist"
fi

if [[ ! -f "$ORIG_APK" ]]
then
	error_exit "Apk not found!"
fi

if ! cd utils/apktool
then
        error_exit "Cannot find apktool dir"
fi


IFS=$(echo -en "\n\b")
PACKAGE_NAME=`./aapt dump badging $ORIG_APK 2>/dev/null | grep "^package:" | awk '{print $2}' | sed "s/name=//g" | sed "s/'//g"`

RESOURCE_DIR="${EXTRES_DIR}/$PACKAGE_NAME"
TMP_RESOURCE_DIR="${EXTRES_DIR}tmp"

#### Add Resources to management ####
echo $ORIG_APK
echo $PACKAGE_NAME
echo $RESOURCE_DIR

# Remove directory
if ! rm -rf $PACKAGE_NAME
then
    error_exit "Cannot remove directory $PACKAGE_NAME"
fi

APKTOOL_DIR=$PACKAGE_NAME

#./apktool d -f -q $APK -o $APKTOOL_DIR -p tmp
unzip $ORIG_APK -d $APKTOOL_DIR > /dev/null
if [ "$?" != "0" ]; then
    error_exit "apktool failed!"
fi

APKTOOL_TMP=tmp
# Delete temp resource directory
rm -rf $TMP_RESOURCE_DIR
if [ "$?" != "0" ]; then
    error_exit "Failed to delete directory $TMP_RESOURCE_DIR"
fi

# Make resource directory in html/..
mkdir $TMP_RESOURCE_DIR
if [ "$?" != "0" ]; then
    error_exit "Cannot create $TMP_RESOURCE_DIR"
fi

# Copy res dir
if [ -d "$APKTOOL_DIR/res" ]; then
    cp -r "$APKTOOL_DIR/res" $TMP_RESOURCE_DIR
    if [ "$?" != "0" ]; then
        error_exit "Cannot copy to $TMP_RESOURCE_DIR"
    fi
fi

# Change owner of files to allow user change it
chown 1000.1000 -R $TMP_RESOURCE_DIR
if [ "$?" != "0" ]; then
    error_exit "Cannot change owner of $TMP_RESOURCE_DIR"
fi

# Copy assets dir
if [ -d "$APKTOOL_DIR/assets" ]; then
	cp -r "$APKTOOL_DIR/assets" $TMP_RESOURCE_DIR
	if [ "$?" != "0" ]; then
	    error_exit "Failed to copy assets to $TMP_RESOURCE_DIR"
	fi
fi

# Delete previous package resource dirs
NUBO_PACKAGE_REFERENCE="$RESOURCE_DIR/nubo_package_reference"
if [ -e $NUBO_PACKAGE_REFERENCE ]; then
    while read package_name; do
        rm -rf "${EXTRES_DIR}${package_name}"
        if [ "$?" != "0" ]; then
            error_exit "Cannot delete ${EXTRES_DIR}${package_name}"
        fi
    done <$NUBO_PACKAGE_REFERENCE
fi

# Delete previous resource dir (need to do this before umount in case a problem occurs)
rm -rf $RESOURCE_DIR
if [ "$?" != "0" ]; then
    error_exit "Cannot delete $RESOURCE_DIR"
fi

# Move tmp resource directory to target resource directory
mv -f $TMP_RESOURCE_DIR $RESOURCE_DIR

# Copy resources to package resources (application can have different packages for resources)
# example: "Package Groups (2)"
NUMBER_OF_PACKAGES=`./aapt dump resources $ORIG_APK | grep 'Package Groups' | grep -oP '\(\K[^)]+'`
echo "NUMBER_OF_PACKAGES $NUMBER_OF_PACKAGES"

i="0"
while [ $i -lt $NUMBER_OF_PACKAGES ]; do
    #example: "Package Group 1 id=127 packageCount=1 name=com.mobisystems.office"
    RESOURCE_PACKAGE_NAME=`./aapt dump resources $ORIG_APK | grep "Package Group $i" | awk '{print $6}' | grep "name=" | sed "s/name=//g"`
    if [ $RESOURCE_PACKAGE_NAME != 'android' ] && [ $RESOURCE_PACKAGE_NAME != $PACKAGE_NAME ]; then

        if [ -d $RESOURCE_DIR/res ]; then
            PACKAGE_RESOURCE_DIR="${EXTRES_DIR}${RESOURCE_PACKAGE_NAME}"
            echo $RESOURCE_PACKAGE_NAME >> $NUBO_PACKAGE_REFERENCE
            mkdir $PACKAGE_RESOURCE_DIR
            if [ "$?" != "0" ]; then
                error_exit "Cannot create $PACKAGE_RESOURCE_DIR"
            fi

            ln -s ../$PACKAGE_NAME/res $PACKAGE_RESOURCE_DIR/res
            if [ "$?" != "0" ]; then
                error_exit "Cannot copy to $PACKAGE_RESOURCE_DIR"
            fi
            # Change owner of files to allow user change it
            chown 1000.1000 $PACKAGE_RESOURCE_DIR
            if [ "$?" != "0" ]; then
                error_exit "Cannot change owner of $PACKAGE_RESOURCE_DIR"
            fi
        fi
    fi

    i=$[ $i + 1 ]
done

if [ -f "$NUBO_PACKAGE_REFERENCE" ]; then
    chown 1000.1000 $NUBO_PACKAGE_REFERENCE
    if [ "$?" != "0" ]; then
        error_exit "Cannot change owner of $NUBO_PACKAGE_REFERENCE"
    fi
fi

# Delete all temp files and directories
#rm -f $APK Don't delete apk in nfs/...apks
rm -rf $APKTOOL_DIR
rm -rf $APKTOOL_TMP
rm -rf $TMP_RESOURCE_DIR
rm -rf prev_$PACKAGE_NAME.apk
rm -rf prev_$PACKAGE_NAME

# Just in case anyone adds code below, these should be unset
unset RES_ZIP_PATH
unset TIME_STAMP

