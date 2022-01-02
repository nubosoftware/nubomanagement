BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv-webplayer
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/opt/nubomanagement

#Copy js files from git project
FILES=`git ls-tree --full-tree -r HEAD | awk '
 ($4 ~ /^html\/.+/) {print $4}
'`

for file in ${FILES}; do
    install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/$file $BUILD_ROOT/opt/nubomanagement/$file
done
install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/html/player/compiler.jar $BUILD_ROOT/opt/nubomanagement/html/player
cd $BUILD_ROOT/opt/nubomanagement/html/player
make
rm login.js
rm wm.js
rm zlibReader.js
rm uxipReader.js
rm uxipWriter.js
rm uxip.js
rm NuboOutputStreamMgr.js
rm nubocache.js
cd -

rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv-webplayer/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

