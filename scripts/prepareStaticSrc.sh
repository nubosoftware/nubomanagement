#!/bin/sh

mkdir -p ./static-src
mkdir -p ./static
mkdir -p ./static-image

cd ./static-image

# prepare the admin module
git clone https://github.com/nubosoftware/nubo-admin.git
cd ./nubo-admin
npm install
cd ..

# prepare the desktop client module
git clone https://github.com/nubosoftware/nubo-desktop-client.git
cd ./nubo-desktop-client
npm install
cd ..


