BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-img
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/opt/Android-Nougat

if [ ! -f $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/ramdisk.img ] || \
   [ ! -f $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/system.img ] || \
   [ ! -d $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/data ]; then
  echo "Android project is not compiled"
  exit 1
fi

install -D -m 644 $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/ramdisk.img $BUILD_ROOT/opt/Android-Nougat/ramdisk.img
install -D -m 644 $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/system.img $BUILD_ROOT/opt/Android-Nougat/system.img
tar -C $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/data/ --owner=root --group=root -czf $BUILD_ROOT/opt/Android-Nougat/userdata.tar.gz .

rsync -r $PROJ_PATH/debbuilder/nubomanagement-img/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

