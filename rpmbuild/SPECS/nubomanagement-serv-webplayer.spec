Summary: nubomanagement service
Name: nubomanagement-serv-webplayer
Version: %{_version}
Release: %{_release}
Group: System Environment/Daemons
BuildArch: x86_64
License: none
Requires: nubomanagement-serv-js

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

#Copy js files from git project
FILES=`git ls-tree --full-tree -r HEAD | awk '
 ($4 ~ /^html\/.+/) {print $4}
'`

for file in ${FILES}; do
    install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/$file $RPM_BUILD_ROOT/opt/nubomanagement/$file
done
install -D -m 644 $NUBO_PROJ_PATH/nubomanagement/html/player/compiler.jar $RPM_BUILD_ROOT/opt/nubomanagement/html/player
cd $RPM_BUILD_ROOT/opt/nubomanagement/html/player
make
rm login.js;
rm wm.js;
rm zlibReader.js;
rm uxipReader.js;
rm uxipWriter.js;
rm uxip.js;
rm NuboOutputStreamMgr.js;
rm nubocache.js;
cd -

%post

%preun

%postun

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)

/opt/nubomanagement/html

