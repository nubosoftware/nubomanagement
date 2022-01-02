
mkfile_path := $(word $(words $(MAKEFILE_LIST)),$(MAKEFILE_LIST))
nubo_proj_dir:=$(shell cd $(shell dirname $(mkfile_path))/..; pwd)
current_dir := $(shell pwd)
LSBDIST := $(shell lsb_release -cs)

full_files_list := $(shell git ls-tree --full-tree -r HEAD | sed 's/^.*\t//')
js_files_list := $(filter-out $(webplayer_files_list),$(full_files_list))
js_files_list := $(filter-out debbuilder/% rpmbuild/% cert/% junc-code/% keys/% emailTemplates/% push/% ffmpeg/%,$(js_files_list))
js_files_list := $(filter-out html/% %.pl platform_vmw_static.js,$(js_files_list))
js_files_list := $(filter-out .gitignore Makefile rsyslog-nubomanagement.conf .DS_Store .rsync-filter,$(js_files_list))
js_files_list := $(filter-out webpack.config.js nubomanagement.service,$(js_files_list))
js_files_list_copy := $(filter-out src/%,$(js_files_list))


src_files_list := $(filter src/%,$(full_files_list))

node_modules_files_list := package.json
vmware_files_list := $(filter %.pl,$(full_files_list))
vmware_files_list += platform_vmw_static.js

default: usage

usage:
	@echo "valid tasks: all, debs, rpms, versions"

all: nubomanagement-serv nubomanagement-serv-common
all: nubomanagement-serv-js nubomanagement-serv-node_modules nubomanagement-serv-vmware
all: nubomanagement-img

BASE_TAG := nubo_release_3.0
BASE_VERSION := 3.0

define get_current_version
$(eval $1_commit=$(shell git log -n 1 --format=oneline -- $($1_files_list)))
$(eval $1_sha1=$(shell echo "$($1_commit)" | cut -d ' ' -f 1))
$(eval $1_version=$(BASE_VERSION))
$(eval $1_buildid=$(shell git log $(BASE_TAG)..$($1_sha1) --oneline | wc -l))
$(eval $1_buildid=$(shell echo $($1_buildid)+1 | bc))
endef

define get_project_version
$(eval $1_version=$(BASE_VERSION))
$(eval $1_buildid=$(shell git log $(BASE_TAG)..HEAD --oneline | wc -l))
$(eval $1_buildid=$(shell echo $($1_buildid)+1 | bc))
endef

$(eval $(call get_project_version,serv))
$(eval $(call get_project_version,common))
$(eval $(call get_current_version,js))
$(eval $(call get_current_version,node_modules))
$(eval $(call get_current_version,vmware))
#$(eval $(call get_project_version,img))
img_version := 3.0
img_buildid := 46

nubomanagement-serv rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-serv-$(serv_version)-$(serv_buildid).x86_64.rpm
nubomanagement-serv debs: $(nubo_proj_dir)/debs/latest/nubomanagement-serv-$(serv_version)-$(serv_buildid).deb
nubomanagement-serv:
	@echo "serv version $(serv_version) $(serv_buildid)"


nubomanagement-serv-common rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-serv-common-$(common_version)-$(common_buildid).x86_64.rpm
nubomanagement-serv-common debs: $(nubo_proj_dir)/debs/latest/nubomanagement-serv-common-$(common_version)-$(common_buildid).deb
nubomanagement-serv-common:
	@echo "common version $(common_version) $(common_buildid)"

nubomanagement-serv-js rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-serv-js-$(js_version)-$(js_buildid).x86_64.rpm
nubomanagement-serv-js debs: $(nubo_proj_dir)/debs/latest/nubomanagement-serv-js-$(js_version)-$(js_buildid).deb
nubomanagement-serv-js:
	@echo "js version $(js_version) $(js_buildid)"

nubomanagement-serv-node_modules rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-serv-node_modules-$(node_modules_version)-$(node_modules_buildid).x86_64.rpm
nubomanagement-serv-node_modules debs: $(nubo_proj_dir)/debs/latest/nubomanagement-serv-node-modules-$(node_modules_version)-$(node_modules_buildid).$(LSBDIST).deb
nubomanagement-serv-node_modules:
	@echo "node_modules version $(node_modules_version) $(node_modules_buildid)"

nubomanagement-serv-vmware rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-serv-vmware-$(vmware_version)-$(vmware_buildid).x86_64.rpm
nubomanagement-serv-vmware debs: $(nubo_proj_dir)/debs/latest/nubomanagement-serv-vmware-$(vmware_version)-$(vmware_buildid).deb
nubomanagement-serv-vmware:
	@echo "vmware version $(vmware_version) $(vmware_buildid)"

nubomanagement-img rpms: $(nubo_proj_dir)/rpms/latest/nubomanagement-img-$(img_version)-$(img_buildid).noarch.rpm
nubomanagement-img debs: $(nubo_proj_dir)/debs/latest/nubomanagement-img-$(img_version)-$(img_buildid).deb
nubomanagement-img:
	@echo "img version $(img_version) $(img_buildid)"

versions:
	@echo "serv version $(serv_version) $(serv_buildid)"
	@echo "common version $(common_version) $(common_buildid)"
	@echo "js version $(js_version) $(js_buildid)"
	@echo "node_modules version $(node_modules_version) $(node_modules_buildid)"
	@echo "vmware version $(vmware_version) $(vmware_buildid)"
	@echo "img version $(img_version) $(img_buildid)"

docker: debs
	mkdir -p docker_build/debs/	
	cp $(nubo_proj_dir)/debs/latest/nubomanagement-serv-node-modules-$(node_modules_version)-$(node_modules_buildid).$(LSBDIST).deb docker_build/debs/nubomanagement-serv-node-modules.deb
	cp $(nubo_proj_dir)/debs/latest/nubomanagement-serv-common-$(common_version)-$(common_buildid).deb docker_build/debs/nubomanagement-serv-common.deb
	cp $(nubo_proj_dir)/debs/latest/nubomanagement-serv-js-$(js_version)-$(js_buildid).deb docker_build/debs/nubomanagement-serv-js.deb
	cp $(nubo_proj_dir)/debs/latest/nubomanagement-serv-$(serv_version)-$(serv_buildid).deb docker_build/debs/nubomanagement-serv.deb
	cp $(nubo_proj_dir)/debs/latest/nubo-common-3.0-1.deb docker_build/debs/nubo-common.deb
	sudo docker build -t nubomanagement:$(serv_version)-$(serv_buildid) docker_build/.

debs rpms: versions

define make_rpm
$(eval cur_version=$(shell echo "$2" | sed 's/.*\(3\.0\)\-\([0-9]*\)\.\(.*\)/\1/'))
$(eval cur_buildid=$(shell echo "$2" | sed 's/.*\(3\.0\)\-\([0-9]*\)\.\(.*\)/\2/'))
$(eval cur_arch=$(shell echo "$2" | sed 's/.*\(3\.0\)\-\([0-9]*\)\.\(.*\)/\3/'))
$(eval pkgname=$(subst -$2.rpm,,$(notdir $1)))
#@echo "rpm $(pkgname) $(cur_version) $(cur_buildid) $(cur_arch)"
NUBO_PROJ_PATH=$(nubo_proj_dir) \
PROJ_PATH=$(current_dir) \
rpmbuild -v \
$3 \
--define "_topdir $(nubo_proj_dir)/nubomanagement/rpmbuild" \
--define "_version $(cur_version)" \
--define "_release $(cur_buildid)" \
--define "_build_id_links none" \
-bb rpmbuild/SPECS/$(pkgname).spec
echo PACKAGE: $(pkgname)
cp $(nubo_proj_dir)/nubomanagement/rpmbuild/RPMS/$(cur_arch)/$(pkgname)-$(cur_version)-$(cur_buildid).$(cur_arch).rpm $(nubo_proj_dir)/rpms/latest/
endef

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-common-%.rpm:
	$(eval versions_line=\
	--define "Js_Version $(js_version)-$(js_buildid)" \
	--define "Node_modules_Version $(node_modules_version)-$(node_modules_buildid)" \
	)
	$(call make_rpm,$@,$*,$(versions_line))

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-vmware-%.rpm:
	$(call make_rpm,$@,$*)

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-js-%.rpm: $(src_files_list)
	$(call make_rpm,$@,$*,--define "FILES $(js_files_list_copy)")

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-node_modules-%.rpm: $(node_modules_files_list)
	$(call make_rpm,$@,$*)

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-webplayer-%.rpm: $(webplayer_files_list)
	$(call make_rpm,$@,$*)

$(nubo_proj_dir)/rpms/latest/nubomanagement-serv-%.rpm:
	$(eval versions_line=\
	Js_Version=$(js_version).$(js_buildid) \
	Node_modules_Version=$(node_modules_version).$(node_modules_buildid) \
	)
	$(call make_rpm,$@,$*)

$(nubo_proj_dir)/rpms/latest/nubomanagement-img-%.rpm:
	$(call make_rpm,$@,$*)

define make_deb
$(eval cur_version=$(shell echo "$2" | sed 's/.*\(3\.0\)\-\([0-9]*\)/\1/'))
$(eval cur_buildid=$(shell echo "$2" | sed 's/.*\(3\.0\)\-\([0-9]*\)/\2/'))
@echo "deb version $(cur_version) $(cur_buildid) $(cur_arch)"
$(eval pkgname=$(subst -$2.deb,,$(notdir $1)))
$(eval pkgname=$(subst -$(cur_version)-$(cur_buildid).deb,,$(notdir $@)))
$3 \
NUBO_PROJ_PATH=$(nubo_proj_dir) \
PROJ_PATH=$(current_dir) \
Version=$(cur_version).$(cur_buildid) \
./debbuilder/$(pkgname)/debbuilder.sh && \
fakeroot dpkg-deb -b debbuild/$(pkgname) $@
endef

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-common-%.deb:
	$(eval versions_line=\
	Js_Version=$(js_version).$(js_buildid) \
	Node_modules_Version=$(node_modules_version).$(node_modules_buildid) \
	)
	$(call make_deb,$@,$*,$(versions_line))

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-vmware-%.deb:
	$(call make_deb,$@,$*)

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-js-%.deb: $(src_files_list)
	$(call make_deb,$@,$*,FILES="$(js_files_list_copy)")

debbuild/nubomanagement-serv-node-modules-%.deb: $(node_modules_files_list)
	$(call make_deb,$@,$*)

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-node-modules-%.$(LSBDIST).deb: debbuild/nubomanagement-serv-node-modules-$(node_modules_version)-$(node_modules_buildid).deb
	cp $< $@

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-webplayer-%.deb: $(webplayer_files_list)
	$(call make_deb,$@,$*)

debbuild/nubomanagement-serv-%.deb:
	$(call make_deb,$@,$*)

$(nubo_proj_dir)/debs/latest/nubomanagement-serv-$(serv_version)-$(serv_buildid).deb: debbuild/nubomanagement-serv-$(serv_version)-$(serv_buildid).deb
	cp $< $@

$(nubo_proj_dir)/debs/latest/nubomanagement-img-%.deb:
	$(call make_deb,$@,$*)

.PHONY: default clean nubomanagement nubomanagement-serv nubomanagement-serv-common
.PHONY: nubomanagement-serv-js nubomanagement-serv-node_modules nubomanagement-serv-vmware nubomanagement-serv-webplayer

clean:
	rm -rf debbuild/
	rm -rf rpmbuild/{BUILD,BUILDROOT}

