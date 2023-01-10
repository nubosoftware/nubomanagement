#!/bin/sh

mkdir -p ./static-src
mkir -p ./static

cd ./static-src
git clone https://github.com/nubosoftware/nubo-admin.git
git clone https://github.com/nubosoftware/nubo-desktop-client.git

