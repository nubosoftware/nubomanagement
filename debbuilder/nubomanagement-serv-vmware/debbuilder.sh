BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv-vmware
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/opt/nubomanagement

#Copy js files from git project
FILES=`git ls-tree --full-tree -r HEAD | awk '
($4 ~ /.+\.pl$/) {print $4}
'`

for file in ${FILES}; do
    install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/$file $BUILD_ROOT/opt/nubomanagement/$file
done

install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/platform_vmw_static.js $BUILD_ROOT/opt/nubomanagement/platform_vmw_static.js
chmod 755 $BUILD_ROOT/opt/nubomanagement/vm*.pl

rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv-vmware/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

