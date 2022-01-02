BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv-js
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/opt/nubomanagement
mkdir -p $BUILD_ROOT/usr/local/bin

echo "Run webpack..."
cd $NUBO_PROJ_PATH/nubomanagement
npm run-script build
cp -a dist/ $BUILD_ROOT/opt/nubomanagement/dist/
cd -

#Copy js files from git project
#FILES=`git ls-tree --full-tree -r HEAD | awk '
#($4 ~ /.+\.js$/) || ($4 ~ /^ControlPanel\/.+/) || ($4 ~ /^scripts\/.+/) || ($4 ~ /^apktool\/.+/) ||
#($4 ~ /^nubo_mysql.json$/) || ($4 ~ /^loadTests\/.+/) || ($4 ~ /^new_user_files\/.+/) || ($4 ~ /^unittests\/.+/)
#{print $4}
#'`

for file in ${FILES}; do
    install -D -p -m 644 $NUBO_PROJ_PATH/nubomanagement/$file $BUILD_ROOT/opt/nubomanagement/$file
done
install -m 644 $NUBO_PROJ_PATH/nubomanagement/Settings.json.init $BUILD_ROOT/opt/nubomanagement/Settings.json
rm -rf $BUILD_ROOT/opt/nubomanagement/html
rm $BUILD_ROOT/opt/nubomanagement/utils/apktool/apktool_2.0.0rc4.jar
chmod 755 $BUILD_ROOT/opt/nubomanagement/scripts/*.sh
chmod 755 $BUILD_ROOT/opt/nubomanagement/utils/apktool/aapt

install -m 755 $NUBO_PROJ_PATH/scripts/rootfs/usr/local/bin/fix_apps.sh $BUILD_ROOT/usr/local/bin/fix_apps.sh

rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv-js/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

