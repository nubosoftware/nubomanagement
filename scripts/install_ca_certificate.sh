#!/bin/bash

# Script must be run in scripts directory inside management dir
# Accepts parameter for certificate file (full path)
# Accepts parameter for path for img files (full path)
# Certificate MUST be in PEM format

# Error handling
function error_exit
{
	echo "$1" 1>&2
	# Delete temp certificate file
	if [ -f "$NEW_CERT_FILE" ]; then
		rm -f "$NEW_CERT_FILE"
	fi

	# Delete temp image file
	if [ -f "$TMP_IMG_FILE" ]; then
		rm -f "$TMP_IMG_FILE"
	fi

	# Delete and unmount mount dir
	if [ -d "$MNT_DIR" ]; then
		umount -f "$MNT_DIR"
		rm -rf "$MNT_DIR"
	fi

	exit -1
}

unset MNT_DIR
unset NEW_CERT_FILE
unset TMP_IMG_FILE

if [ "$#" -ne 2 ]; then
    echo "Illegal number of parameters. Aborting"
    echo "Usage: sudo install_ca_certificate.sh <path_to_certificate_file> <path_to_android_img_files>"
    exit -1
fi

CERT_FILE="$1"
IMAGES_PATH="$2"
TMP_IMG_DIR=`pwd`

if [[ ! -f "$CERT_FILE" ]]
then
	error_exit "Certificate file not found!. Aborting"
fi

#### Test if openssl exists ####
command -v openssl >/dev/null 2>&1 || error_exit "Cannot find openssl. Aborting"

#### Make sure only root can run our script ####
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

NEW_CERT_FILE=`openssl x509 -inform PEM -subject_hash_old -in "$CERT_FILE"`
if [ "$?" != "0" ]; then
    error_exit "Wrong certificate format. DER?. Aborting"
fi
NEW_CERT_FILE=`echo "$NEW_CERT_FILE" | head -1`
NEW_CERT_FILE+=".0"

#### Dump certificate to new file ####
JUST_CERTIFICATE=`openssl x509 -in "$CERT_FILE"`
if [ "$?" != "0" ]; then
    error_exit "Error creating certificate file. Aborting"
fi

echo "$JUST_CERTIFICATE" >> "$NEW_CERT_FILE"
if [[ ! -f "$NEW_CERT_FILE" ]]
then
    error_exit "Error creating certificate file. Aborting"
fi

#### Update image ####
IMG_FILE=$IMAGES_PATH/system.img
TMP_IMG_FILE=system_tmp.img
cp $IMG_FILE $TMP_IMG_FILE
if [ "$?" != "0" ]; then
    error_exit "Failed to copy image to $TMP_IMG_FILE. Aborting"
fi

#### Create mount dir ####
MNT_DIR=system_img
rm -rf "$MNT_DIR"
mkdir "$MNT_DIR"

if [ ! -d "$MNT_DIR" ]; then
	error_exit "Failed to create mnt dir"
fi

#### Try to mount image several times ####
try_counter=0
last_try=0
until [ $try_counter -ge 5 ]
do
	mount -o loop "$TMP_IMG_FILE" "$MNT_DIR"
        last_try="$?"
	[ $last_try -eq "0" ] && break
	try_counter=$[$try_counter+1]
        umount -f "$MNT_DIR"
	sleep 2
done
if [ $last_try != "0" ]; then
	error_exit "Failed to mount "$TMP_IMG_FILE". Aborting"
fi

#### Copy certificate ####
cp $NEW_CERT_FILE $MNT_DIR/etc/security/cacerts/
if [ "$?" != "0" ]; then
    error_exit "Cannot copy to $NEW_CERT_FILE to image. Aborting"
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
if [ $last_try != "0" ]; then
	error_exit "Failed to unmount "$TMP_IMG_FILE". Aborting"
fi

#### Test new image ####
fsck -a -M "$TMP_IMG_DIR/$TMP_IMG_FILE"
if [ "$?" != "0" ]; then
    error_exit "Errors found while testing image file. apk not uploaded"
fi

#### Copy tmp image to image ####
mv -f "$TMP_IMG_FILE" "$IMG_FILE"
if [ "$?" != "0" ]; then
    error_exit "Failed to copy image back to $IMG_FILE. Aborting"
fi

chown 1000.1000 $IMG_FILE
if [ "$?" != "0" ]; then
    error_exit "Cannot change owner of $IMG_FILE"
fi

rm -rf "$MNT_DIR"
rm -f "$TMP_IMG_FILE"
rm -f "$NEW_CERT_FILE"

