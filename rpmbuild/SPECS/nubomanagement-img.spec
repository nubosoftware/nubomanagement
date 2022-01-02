Summary: nubomanagement service
Name: nubomanagement-img
Version: %{_version}
Release: %{_release}
Group: System Environment/Daemons
BuildArch: noarch
License: none

%description
images of android file system

#%prep
#%setup -q
#%patch -p1 -b .buildroot

%build
#make -C $NUBO_PROJ_PATH clean
#make -C $NUBO_PROJ_PATH

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/opt/Android-Nougat

if [ ! -f $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/ramdisk.img ] || \
   [ ! -f $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/system.img ] || \
   [ ! -d $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/data ]; then
  echo "Android project is not compiled"
  exit 1
fi

install -D -m 644 $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/ramdisk.img $RPM_BUILD_ROOT/opt/Android-Nougat/ramdisk.img
install -D -m 644 $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/system.img $RPM_BUILD_ROOT/opt/Android-Nougat/system.img
tar -C $NUBO_PROJ_PATH/nuboplatform/out/target/product/x86_platform/data/ --owner=root --group=root -czf $RPM_BUILD_ROOT/opt/Android-Nougat/userdata.tar.gz .

%post

if [ ! -f /opt/Android-Nougat/cache.img ]; then
  dd if=/dev/zero of=/opt/Android-Nougat/cache.img bs=1M count=2048 && mkfs.ext4 -F /opt/Android-KitKat/cache.img
  mkfs.ext4 -F /opt/Android-Nougat/cache.img
fi
if [ ! -f /opt/Android-Nougat/userdata.img ]; then
  dd if=/dev/zero of=/opt/Android-Nougat/userdata.img bs=1M count=2048 && mkfs.ext4 -F /opt/Android-KitKat/userdata.img
  mkfs.ext4 -F /opt/Android-Nougat/userdata.img
  tries=5;
  while true; do
    RAND_SUFFIX=`dd if=/dev/urandom count=4 bs=1 2>/dev/null | hexdump -e '/16 ""' -e '/1 "%x"' -e '/16 ""'`
    MY_DIR=/opt/Android-Nougat/mnt-${RAND_SUFFIX}
    if mkdir ${MY_DIR} 2>/dev/null ; then
      mount -o loop /opt/Android-Nougat/userdata.img ${MY_DIR}
      tar -xf /opt/Android-Nougat/userdata.tar.gz -C ${MY_DIR}
      umount ${MY_DIR}
      rmdir ${MY_DIR}
      break
    else
      echo "dir ${MY_DIR} already exist"
      tries=$((tries-1))
      if [ "$tries" -le 0 ]; then
        echo "no tries left"
        exit 1
      fi
    fi
  done
else
  echo "userdata.img already exist"
fi

tries=5;
while true; do
  RAND_SUFFIX=`dd if=/dev/urandom count=4 bs=1 2>/dev/null | hexdump -e '/16 ""' -e '/1 "%x"' -e '/16 ""'`
  MY_DIR=/opt/Android-Nougat/mnt-${RAND_SUFFIX}
  if mkdir ${MY_DIR} 2>/dev/null ; then
    mount -o loop /opt/Android-Nougat/userdata.img ${MY_DIR}
    if [ ! -f ${MY_DIR}/local/chrome-command-line ]; then
      mkdir ${MY_DIR}/local
      echo "chrome --single-process --disable-es3-gl-context --disable-es3-apis --disable-gl-error-limit" > ${MY_DIR}/local/chrome-command-line
      chmod 644 ${MY_DIR}/local/chrome-command-line
    fi
    umount ${MY_DIR}
    rmdir ${MY_DIR}
    break
  else
    echo "dir ${MY_DIR} already exist"
    tries=$((tries-1))
    if [ "$tries" -le 0 ]; then
      echo "no tries left"
      exit 1
    fi
  fi
done

%preun

%postun
rm /opt/Android-Nougat/cache.img

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)

/opt/Android-Nougat/ramdisk.img
/opt/Android-Nougat/system.img
/opt/Android-Nougat/userdata.tar.gz

