BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv-common
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/etc/systemd/system
mkdir -p $BUILD_ROOT/etc/rsyslog.d

install -m 644 $NUBO_PROJ_PATH/nubomanagement/utils/service/nubomanagement.service $BUILD_ROOT/etc/systemd/system/nubomanagement.service
install -m 644 $NUBO_PROJ_PATH/nubomanagement/utils/service/rsyslog-nubomanagement.conf $BUILD_ROOT/etc/rsyslog.d/18-nubomanagement.conf


rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv-common/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control
sed "s/%Js_Version%/$Js_Version/g" -i $BUILD_ROOT/DEBIAN/control
sed "s/%Node_modules_Version%/$Node_modules_Version/g" -i $BUILD_ROOT/DEBIAN/control

