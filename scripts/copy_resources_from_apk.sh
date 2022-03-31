#!/bin/sh

# Script must be run in management dir
# $1 apk file (full path)
# $2 path for img files (full path)
# $3 path to apks dir
# $4 name of package in control panel
# $5 directory for resources
# $6 'donotcopy': Change apk's name
# $7 gid for apk

# Error handling
function error_exit
{
	echo "$1" 1>&2
	# Delete temp <package>.apk
	if [ -n "$APK" ] && [ "$DO_COPY" == "copy" ] ; then
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
		if [ -d "prev_$PACKAGE_NAME" ]; then
			mv -f prev_$PACKAGE_NAME $APK_IN_IMAGE
                        touch -d "$TIME_STAMP"  $APK_IN_IMAGE
                        mv -f prev_$PACKAGE_NAME $MNT_DIR/app/$PACKAGE_NAME
                        touch -d "$TIME_STAMP" $MNT_DIR/app/$PACKAGE_NAME
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
unset APKTOOL_DIR
unset APKTOOL_TMP
unset MNT_DIR
unset APK_IN_IMAGE

ORIG_APK=`echo "$1" | sed "s/\(\.apk\)[ \t]*$/\1/Ig"`
IMAGES_PATH="$2"
APKS_DIR="$3"
PACKAGE_FROM_CTRL_PANEL="$4"
RESOURCE_HOME_PATH="$5"
DO_COPY="$6"
GID="$7"


if [ -z ${RESOURCE_HOME_PATH} ]; then
    error_exit "Resources home path not found"
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
PACKAGE_NAME=`./aapt dump badging $ORIG_APK 2>/dev/null | grep package | awk '{print $2}' | sed "s/name=//g" | sed "s/'//g"`

if [ "$PACKAGE_NAME" != "$PACKAGE_FROM_CTRL_PANEL" ]
then
	error_exit "Wrong package name: $PACKAGE_FROM_CTRL_PANEL"
fi

EXTRES_DIR="${RESOURCE_HOME_PATH}html/player/extres/"
RESOURCE_DIR="${EXTRES_DIR}$PACKAGE_NAME"
TMP_RESOURCE_DIR="${EXTRES_DIR}tmp"
TMP_IMG_DIR=`pwd`
#### Make APK filename singular ####
APK=$APKS_DIR$PACKAGE_NAME.apk
if [ "$DO_COPY" == "donotcopy" ]; then
    echo "Not copying apk"
else
    cp $ORIG_APK $APK
    chmod 644 $APK
fi

if [ "$?" != "0" ]; then
    error_exit "Failed to copy apk $ORIG_APK"
fi

#### Add Resources to management ####
echo $PACKAGE_NAME
echo $RESOURCE_DIR

# Remove directory
if ! rm -rf $PACKAGE_NAME
then
    error_exit "Cannot remove directory $PACKAGE_NAME"
fi

APKTOOL_DIR=$PACKAGE_NAME

#./apktool d -f -q $APK -o $APKTOOL_DIR -p tmp
unzip $APK -d $APKTOOL_DIR > /dev/null
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
cp -r "$APKTOOL_DIR/res" $TMP_RESOURCE_DIR
if [ "$?" != "0" ]; then
    error_exit "Cannot copy to $TMP_RESOURCE_DIR"
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

#### Separate to 2 compressed files with permissions ####
SAVE_PATH=`pwd`
cd "$APKTOOL_DIR"
zip -r res.zip resources.arsc res AndroidManifest.xml > /dev/null
if [ "$?" != "0" ]; then
    error_exit "Failed to create res.zip"
fi

# Make new directory for resources
mkdir "$PACKAGE_NAME"
if [ "$?" != "0" ]; then
    error_exit "Failed to mkdir $PACKAGE_NAME"
fi
mv res.zip "$PACKAGE_NAME"

cd "$SAVE_PATH"

#### Update image ####
IMG_FILE=$IMAGES_PATH/userdata.img
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
	[ $last_try -eq "0" ] && break
	try_counter=$[$try_counter+1]
        umount -f $MNT_DIR
	sleep 2
done
if [ $last_try != "0" ]; then
	error_exit "Failed to mount $TMP_IMG_FILE"
fi

# Create  app dir if it doesn't exist
if [ ! -d $MNT_DIR/app ]; then
	mkdir $MNT_DIR/app
	chown 1000.1000 $MNT_DIR/app
	chmod 771 $MNT_DIR/app
	if [ "$?" != "0" ]; then
		error_exit "Failed to create dir $MNT_DIR/app"
	fi
	echo CREATE APP DIR
fi

## If the filename already exists in the image then move it
#if [ -e $MNT_DIR/app/$PACKAGE_NAME.apk ]; then
#        # Remember timestamp since we're updating
#        TIME_STAMP=`stat $MNT_DIR/app/$PACKAGE_NAME.apk | awk '/^Modify:/ {print $2 " " $3 " " $4}'`
#        mv -f $MNT_DIR/app/$PACKAGE_NAME.apk prev_$PACKAGE_NAME.apk
#fi

# If the dir already exists in the image then move it
if [ -d $MNT_DIR/app/$PACKAGE_NAME ]; then
        mv -f $MNT_DIR/app/$PACKAGE_NAME prev_$PACKAGE_NAME
fi

# Make app dir
mkdir $MNT_DIR/app/$PACKAGE_NAME
chown 1000.1000 $MNT_DIR/app/$PACKAGE_NAME
chmod 755 $MNT_DIR/app/$PACKAGE_NAME

# Copy app
cp $APK $MNT_DIR/app/$PACKAGE_NAME && chmod 644 $MNT_DIR/app/$PACKAGE_NAME/$PACKAGE_NAME.apk
chown 1000.1000 $MNT_DIR/app/$PACKAGE_NAME/$PACKAGE_NAME.apk
if [ "$?" != "0" ]; then
    error_exit "Cannot copy to $APK to image"
fi
#rm $MNT_DIR/app/$PACKAGE_NAME.apk || true

## Copy res.zip
#RES_ZIP_PATH="$APKTOOL_DIR/$PACKAGE_NAME"
#cp -r "$RES_ZIP_PATH" "$MNT_DIR/app-private" && chmod 644 -R "$MNT_DIR/app-private/$PACKAGE_NAME"
#if [ "$?" != "0" ]; then
#    error_exit "Cannot copy to $APK to image"
#fi
#chown -R 1000.1000 "$MNT_DIR/app-private/$PACKAGE_NAME"
#if [ "$?" != "0" ]; then
#    error_exit "Cannot chown $MNT_DIR/app-private/$PACKAGE_NAME"
#fi
#chmod 755 -R "$MNT_DIR/app-private/$PACKAGE_NAME"
#if [ "$?" != "0" ]; then
#    error_exit "Cannot chown $MNT_DIR/app-private/$PACKAGE_NAME"
#fi
#chown -R 1000."$GID" "$MNT_DIR/app-private/$PACKAGE_NAME.apk"
#if [ "$?" != "0" ]; then
#    error_exit "Cannot chown $MNT_DIR/app-private/$PACKAGE_NAME"
#fi
#chmod 640 "$MNT_DIR/app-private/$PACKAGE_NAME.apk"
#if [ "$?" != "0" ]; then
#    error_exit "Cannot chmod $MNT_DIR/app-private/$PACKAGE_NAME.apk"
#fi
APK_IN_IMAGE=$MNT_DIR/app/$PACKAGE_NAME/$PACKAGE_NAME.apk

# Change timestamp if we replaced an apk
if [ -n "$TIME_STAMP" ]; then
    echo "Changing timestamp"
    touch -d "$TIME_STAMP"  $APK_IN_IMAGE
fi

#### Try to unmount image several times ####
try_counter=0
last_try=0
until [ $try_counter -ge 5 ]
do
	umount -f "$MNT_DIR"
        last_try="$?"
	[ $last_try -eq "0" ] && break
	try_counter=$[$try_counter+1]
        umount -f "$MNT_DIR"
	sleep 2
done

#### Test new image ####
/sbin/fsck -a "$TMP_IMG_DIR/$TMP_IMG_FILE"
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

FILE_CREATED=false
i="0"
while [ $i -lt $NUMBER_OF_PACKAGES ]; do
    #example: "Package Group 1 id=127 packageCount=1 name=com.mobisystems.office"
    RESOURCE_PACKAGE_NAME=`./aapt dump resources $ORIG_APK | grep "Package Group $i" | awk '{print $6}' | grep "name=" | sed "s/name=//g"`
    if [ $RESOURCE_PACKAGE_NAME != 'android' ] && [ $RESOURCE_PACKAGE_NAME != $PACKAGE_NAME ]; then

        # create file only once
        if [ "$FILE_CREATED" = false ]; then
            touch $NUBO_PACKAGE_REFERENCE
            # Change owner of file to allow user change it
            chown 1000.1000 $NUBO_PACKAGE_REFERENCE
            if [ "$?" != "0" ]; then
                error_exit "Cannot change owner of $NUBO_PACKAGE_REFERENCE"
            fi
            FILE_CREATED=true
        fi

        PACKAGE_RESOURCE_DIR="${EXTRES_DIR}${RESOURCE_PACKAGE_NAME}"
        echo $RESOURCE_PACKAGE_NAME >> $NUBO_PACKAGE_REFERENCE
        mkdir $PACKAGE_RESOURCE_DIR
        if [ "$?" != "0" ]; then
            error_exit "Cannot create $PACKAGE_RESOURCE_DIR"
        fi

        # Copy res dir
        cp -r -p "$RESOURCE_DIR/res" $PACKAGE_RESOURCE_DIR
        if [ "$?" != "0" ]; then
            error_exit "Cannot copy to $PACKAGE_RESOURCE_DIR"
        fi
        # Change owner of files to allow user change it
        chown 1000.1000 -R $PACKAGE_RESOURCE_DIR
        if [ "$?" != "0" ]; then
            error_exit "Cannot change owner of $PACKAGE_RESOURCE_DIR"
        fi
    fi

    i=$[ $i + 1 ]
done

# Delete all temp files and directories
#rm -f $APK Don't delete apk in nfs/...apks
rm -rf $APKTOOL_DIR
rm -rf $APKTOOL_TMP
rm -rf $TMP_RESOURCE_DIR
rm -rf $MNT_DIR
rm -rf prev_$PACKAGE_NAME.apk
rm -rf prev_$PACKAGE_NAME

# Just in case anyone adds code below, these should be unset
unset RES_ZIP_PATH
unset TIME_STAMP
unset MNT_DIR
unset APK_IN_IMAGE



