#!/bin/sh

npm install --only=dev
if [ ! -d "./nubo-management-mobile" ]
then
    echo "Directory nubo-management-mobile does not exists. Clone from git project."
    git clone git@github.com:nubosoftware/nubo-management-mobile.git
fi
node ./nubo-management-mobile/scripts/attachToManagement.js
if [ ! -d "./nubo-management-enterprise" ]
then
    echo "Directory nubo-management-enterprise does not exists. Clone from git project."
    git clone git@github.com:nubosoftware/nubo-management-enterprise.git
fi
node ./nubo-management-enterprise/scripts/attachToManagement.js
npm install

