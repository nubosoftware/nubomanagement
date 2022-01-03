#!/bin/bash


if [ ! -d "./nubo-management-desktop" ] 
then   
    echo "Directory nubo-management-desktop does not exists. Clone from git project."
    git clone git@github.com:nubosoftware/nubo-management-desktop.git
fi
node ./nubo-management-desktop/scripts/attachToManagement.js
npm install

