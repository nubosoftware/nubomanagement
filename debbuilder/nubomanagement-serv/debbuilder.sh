BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT

rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

