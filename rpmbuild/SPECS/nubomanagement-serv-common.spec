Summary: nubomanagement service common files
Name: nubomanagement-serv-common
Version: %{_version}
Release: %{_release}
Group: System Environment/Daemons
BuildArch: x86_64
License: none
Requires: nubomanagement-serv-js = %{Js_Version}, nubomanagement-serv-node_modules = %{Node_modules_Version}, nubomanagement-serv

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
mkdir -p $RPM_BUILD_ROOT/etc/systemd/system
mkdir -p $RPM_BUILD_ROOT/etc/rsyslog.d

install -m 644 $NUBO_PROJ_PATH/nubomanagement/utils/service/nubomanagement.service $RPM_BUILD_ROOT/etc/systemd/system/nubomanagement.service
install -m 644 $NUBO_PROJ_PATH/nubomanagement/utils/service/rsyslog-nubomanagement.conf $RPM_BUILD_ROOT/etc/rsyslog.d/18-nubomanagement.conf

%post
systemctl enable nubomanagement > /dev/null 2>&1 ||:

#Restart after every install/update
systemctl restart nubomanagement > /dev/null 2>&1 ||:

%preun
if [ $1 = 0 ]; then
	#Stop service and remove from services list on full remove
	systemctl disable nubomanagement > /dev/null 2>&1 ||:
	systemctl stop nubomanagement > /dev/null 2>&1 ||:
fi

%postun
if [ "$1" -ge "1" ]; then
	#Restart service after downgrade
	systemctl restart nubomanagement > /dev/null 2>&1 ||:
fi

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)

/etc/systemd/system/nubomanagement.service
%config(noreplace) /etc/rsyslog.d/18-nubomanagement.conf

