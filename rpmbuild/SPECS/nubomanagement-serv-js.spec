Summary: nubomanagement service
Name: nubomanagement-serv-js
Version: %{_version}
Release: %{_release}
Group: System Environment/Daemons
BuildArch: x86_64
License: none
Requires: nodejs, nubomanagement-serv, glibc(x86-32), zlib(x86-32), libstdc++(x86-32), zip

%description
nubo management web service that run in internal network

#%prep
#%setup -q
#%patch -p1 -b .buildroot

%build
#make -C $NUBO_PROJ_PATH clean
#make -C $NUBO_PROJ_PATH

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/opt/nubomanagement
mkdir -p $RPM_BUILD_ROOT/usr/local/bin

echo "Run webpack..."
cd $NUBO_PROJ_PATH/nubomanagement
npm run-script build
cp -a dist/ $RPM_BUILD_ROOT/opt/nubomanagement/dist/
cd -

for file in %{FILES}; do
    install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/$file $RPM_BUILD_ROOT/opt/nubomanagement/$file
done
install -m 644 $NUBO_PROJ_PATH/nubomanagement/Settings.json.init $RPM_BUILD_ROOT/opt/nubomanagement/Settings.json
#chmod 755 $RPM_BUILD_ROOT/opt/nubomanagement/utils/apktool/aapt
#chmod 755 $RPM_BUILD_ROOT/opt/nubomanagement/utils/apktool/apktool
#chmod 755 $RPM_BUILD_ROOT/opt/nubomanagement/vm*.pl
chmod 755 $RPM_BUILD_ROOT/opt/nubomanagement/scripts/*.sh
chmod 755 $RPM_BUILD_ROOT/opt/nubomanagement/utils/apktool/aapt

#rm $RPM_BUILD_ROOT/opt/nubomanagement/apktool/apktool_2.0.0rc4.jar || true
#rm $RPM_BUILD_ROOT/opt/nubomanagement/platform_vmw.js || true
#rm $RPM_BUILD_ROOT/opt/nubomanagement/platform_vmw_static.js || true

#install -m 755 $NUBO_PROJ_PATH/scripts/rootfs/usr/local/bin/fix_apps.sh $RPM_BUILD_ROOT/usr/local/bin/fix_apps.sh

%post

%preun

%postun

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)

%config(noreplace) /opt/nubomanagement/Settings.json

/opt/nubomanagement
