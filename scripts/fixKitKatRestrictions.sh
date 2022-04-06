#!/bin/bash

if [ "$1" != "1" ] ; then
    read -p "This should be run with sudo under the NFS folder. Press any key..." -n1 -s
fi

find * -name package-restrictions.xml | xargs sed -i.backup "s/android\.settings.*enabledCaller.*>/android.settings\">/g"
echo

