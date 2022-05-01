#!/bin/sh

npm install
if [ ! -d "./nubo-management-desktop" ]
then
    echo "Directory nubo-management-desktop does not exists. Clone from git project."
    git clone git@github.com:nubosoftware/nubo-management-desktop.git
fi
node ./nubo-management-desktop/scripts/attachToManagement.js
if [ ! -d "./nubo-management-enterprise" ]
then
    echo "Directory nubo-management-enterprise does not exists. Clone from git project."
    git clone git@github.com:nubosoftware/nubo-management-enterprise.git
fi
node ./nubo-management-enterprise/scripts/attachToManagement.js
npm install

