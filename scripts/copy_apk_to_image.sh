#!/bin/bash

# Script must be run in management dir
# Accepts parameter for apk file (full path)
# Accepts parameter for path for img files (full path)

# Error handling
function error_exit
{
	echo "$1" 1>&2
	# Delete temp <package>.apk
	if [ -n "$APK" ]; then
		echo "Reached 1 APK=$APK"
#		rm -f $APK
	fi

	# Delete tmp image file
	if [ -n "$TMP_IMG_FILE" ]; then
		echo "Reached TMP_IMG_FILE =$TMP_IMG_FILE"
		if [ -e "$TMP_IMG_FILE" ]; then
			rm -f $TMP_IMG_FILE
		fi
	fi

	# Move original app back to image
	if [ -n "$APK_IN_IMAGE" ]; then
		echo "Reached 3 APK_IN_IMAGE=$APK_IN_IMAGE"
		if [ -e "prev_$PACKAGE_NAME.apk" ]; then
			mv -f prev_$PACKAGE_NAME.apk $APK_IN_IMAGE
                        touch -d "$TIME_STAMP"  $APK_IN_IMAGE
		fi
	fi

	# Delete and unmount mount dir
	if [ -n "$MNT_DIR" ]; then
		echo "Reached 4 MNT_DIR=$MNT_DIR"
		umount -f $MNT_DIR
		rm -rf $MNT_DIR
	fi
	exit -1
}

unset APK
unset MNT_DIR
unset APK_IN_IMAGE

ORIG_APK="$1"
IMG_FILE="$2"

if [[ ! -f "$ORIG_APK" ]]
then
	error_exit "Apk not found!"
fi

if ! cd utils/apktool
then
        error_exit "Cannot find apktool dir"
fi

PACKAGE_NAME=`./aapt dump badging $ORIG_APK 2>/dev/null | grep package | awk '{print $2}' | sed "s/name=//g" | sed "s/'//g"`

#### Add Resources to management ####
echo $PACKAGE_NAME

# Remove directory
if ! rm -rf $PACKAGE_NAME
then
    error_exit "Cannot remove directory $PACKAGE_NAME"
fi


#### Update image ####
TMP_IMG_FILE=userdata_tmp.img

cp $IMG_FILE $TMP_IMG_FILE
if [ "$?" != "0" ]; then
    error_exit "Failed to copy image to $TMP_IMG_FILE"
fi

#### Create mount dir ####
rm -rf mnt
mkdir mnt

if [ ! -d mnt ]; then
	error_exit "Failed to create mnt dir"
fi

#### Try to mount image several times ####
MNT_DIR=mnt
try_counter=0
last_try=0
until [ $try_counter -ge 5 ]
do
	mount -o loop $TMP_IMG_FILE mnt
        last_try="$?"
	[ "$last_try" -eq "0" ] && break
	try_counter=$[$try_counter+1]
        umount -f $MNT_DIR
	sleep 2
done
if [ "$last_try" != "0" ]; then
	error_exit "Failed to mount $TMP_IMG_FILE"
fi

# Need to create app dir
if [ ! -d $MNT_DIR/app ]; then
	mkdir $MNT_DIR/app
	chown 1000.1000 $MNT_DIR/app
	if [ "$?" != "0" ]; then
		error_exit "Failed to create dir $MNT_DIR/app"
	fi
	echo "CREATE APP DIR"
fi

# If the filename already exists in the image then move it
if [ -e $MNT_DIR/app/$PACKAGE_NAME.apk ]; then
        # Remember timestamp since we're updating
        TIME_STAMP=`stat $MNT_DIR/app/$PACKAGE_NAME.apk | awk '/^Modify:/ {print $2 " " $3 " " $4}'`
        mv -f $MNT_DIR/app/$PACKAGE_NAME.apk prev_$PACKAGE_NAME.apk
fi

# Copy app
cp $ORIG_APK $MNT_DIR/app && chmod 644 $MNT_DIR/app/$PACKAGE_NAME.apk
if [ "$?" != "0" ]; then
    error_exit "Cannot copy to $APK to image"
fi

APK_IN_IMAGE=$MNT_DIR/app/$PACKAGE_NAME.apk

# Change timestamp if we replaced an apk
if [ -n "$TIME_STAMP" ]; then
    echo "Changing timestamp"
    touch -d "$TIME_STAMP"  "$APK_IN_IMAGE"
fi

#### Try to unmount image several times ####
try_counter=0
last_try=0
until [ "$try_counter" -ge 5 ]
do
	umount -f "$MNT_DIR"
        last_try="$?"
	[ "$last_try" -eq "0" ] && break
	try_counter=$[$try_counter+1]
        umount -f "$MNT_DIR"
	sleep 2
done

#### Test new image ####
fsck.ext4 -fa "$TMP_IMG_FILE"
if [ "$?" != "0" ]; then
    error_exit "Errors found while testing image file. apk not uploaded"
fi

#### Copy tmp image to image ####
mv -f $TMP_IMG_FILE $IMG_FILE
if [ "$?" != "0" ]; then
    error_exit "Failed to copy image back to $IMG_FILE"
fi

chown 1000.1000 $IMG_FILE
if [ "$?" != "0" ]; then
    error_exit "Cannot change owner of $IMG_FILE"
fi

# Delete all temp files and directories
#rm -f $APK Don't delete apk in nfs/...apks
rm -rf $MNT_DIR
rm -rf prev_$PACKAGE_NAME.apk

# Just in case anyone adds code below, these should be unset
unset TIME_STAMP
unset MNT_DIR
unset APK_IN_IMAGE

