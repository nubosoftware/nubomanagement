BUILD_ROOT=${BUILD_ROOT:="$PROJ_PATH/debbuild"}/nubomanagement-serv-node-modules
Version=${Version:="1.2.0.0"}

echo "NUBO_PROJ_PATH $NUBO_PROJ_PATH"
echo "BUILD_ROOT $BUILD_ROOT"

rm -rf $BUILD_ROOT
mkdir -p $BUILD_ROOT/opt/nubomanagement

install -m 644 $NUBO_PROJ_PATH/nubomanagement/package.json $BUILD_ROOT/opt/nubomanagement/package.json
if [ -d "$NUBO_PROJ_PATH/nubomanagement/nubo-management-enterprise" ]; then
  # Take action if $DIR exists. #
  echo "Installing packages in $BUILD_ROOT/opt/nubomanagement/nubo-management-enterprise..."
  mkdir -p $BUILD_ROOT/opt/nubomanagement/nubo-management-enterprise
  install -m 644 $NUBO_PROJ_PATH/nubomanagement/nubo-management-enterprise/package.json $BUILD_ROOT/opt/nubomanagement/nubo-management-enterprise/package.json
fi
if [ -d "$NUBO_PROJ_PATH/nubomanagement/nubo-management-mobile" ]; then
  # Take action if $DIR exists. #
  echo "Installing packages in $BUILD_ROOT/opt/nubomanagement/nubo-management-mobile..."
  mkdir -p $BUILD_ROOT/opt/nubomanagement/nubo-management-mobile
  install -m 644 $NUBO_PROJ_PATH/nubomanagement/nubo-management-mobile/package.json $BUILD_ROOT/opt/nubomanagement/nubo-management-mobile/package.json
fi
if [ -d "$NUBO_PROJ_PATH/nubomanagement/nubo-management-desktop" ]; then
  # Take action if $DIR exists. #
  echo "Installing packages in $BUILD_ROOT/opt/nubomanagement/nubo-management-desktop..."
  mkdir -p $BUILD_ROOT/opt/nubomanagement/nubo-management-desktop
  install -m 644 $NUBO_PROJ_PATH/nubomanagement/nubo-management-desktop/package.json $BUILD_ROOT/opt/nubomanagement/nubo-management-desktop/package.json
fi
sed "s:$NUBO_PROJ_PATH:$BUILD_ROOT/opt:g" -i $BUILD_ROOT/opt/nubomanagement/package.json

cd $BUILD_ROOT/opt/nubomanagement/
npm install --only=prod
rm package.json
cd -


rsync -r $PROJ_PATH/debbuilder/nubomanagement-serv-node-modules/DEBIAN/ $BUILD_ROOT/DEBIAN/
sed "s/%Version%/$Version/g" -i $BUILD_ROOT/DEBIAN/control

