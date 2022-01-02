"use strict";

var child_process = require('child_process');
var fs = require('fs');

var async = require('async');
var AWS = require('aws-sdk');
var _ = require("underscore");

var Common = require('../common.js');
var ThreadedLogger = require('../ThreadedLogger.js');

var execFile = require('child_process').execFile;
var CACHE_SNAPID = "snap-0437d9c5be745e9ff";

var ec2;

var images = ["system.img", "userdata.img", "linux.img", "cache.img"];
var getImagesSnapshotsMountMap = function() {
    return {
        "system.img": {
            imageSrc: Common.imagesPath + "/system.img",
            imageDst: "/mnt/system.img/image",
            volumeDst: "/mnt/system.img/volume",
        },
        "userdata.img": {
            imageSrc: Common.imagesPath + "/userdata.img",
            imageDst: "/mnt/userdata.img/image",
            volumeDst: "/mnt/userdata.img/volume"
        },
        "linux.img": {
            imageSrc: Common.imagesPath + "/linux.img",
            imageDst: "/mnt/linux.img/image",
            volumeDst: "/mnt/linux.img/volume"
        }
    };
};

function getCurrentAwsData(callback) {
    var getVolumeIds = function(callback) {
        var volumes = {};
        async.mapSeries(
            images,
            function(image, callback) {
                var volumeParam = {
                    Filters: [
                        {
                            Name: "tag:Name",
                            Values: [image]
                        }
                        //{
                        //    Name: "tag"
                        //    Values: ["Name=" + image]
                        //}
                    ]
                };
                ec2.describeVolumes(volumeParam, function(err, data) {
                    //console.log("getVolumeIds data for image " + image + ": " + JSON.stringify(data));
                    if(err) {
                        callback(err);
                    } else {
                        if(data.Volumes.length === 1) {
                            volumes[image] = {
                                VolumeId: data.Volumes[0].VolumeId
                            };
                            if(data.Volumes[0].Attachments.length === 1) {
                                var device = data.Volumes[0].Attachments[0].Device.replace("/dev/sd", "/dev/xvd");
                                if(image === "linux.img") device = device + "1";
                                volumes[image].Attachment_Device = device;
                            }
                            callback(null, data.Volumes[0].VolumeId);
                        } else {
                            callback("Duplicate volumes for " + image);
                        }
                    }
                });
            },
            function(err) {
                console.log("getVolumeIds volumes: " + JSON.stringify(volumes));
                callback(err, volumes);
            }
        );
    }
    var res = {};

    async.series(
        [
            function(callback) {
                var meta = new AWS.MetadataService();
                meta.request("/latest/meta-data/instance-id", function(err, data) {
                    //console.log("Meta: ", data);
                    if(err) {
                        callback(err);
                    } else {
                        res.instanceId = data;
                        callback(null);
                    }
                });
            },
            function(callback) {
                getVolumeIds(function(err, volumes) {
                    if(err) {
                        callback(err);
                    } else {
                        res.volumes = volumes;
                        callback(null);
                    }
                });
            }
        ], function(err) {
            if(err) {
                console.log("getCurrentAwsData failed with err: " + JSON.stringify(err));
                callback(err);
            } else {
                console.log("getCurrentAwsData data: " + JSON.stringify(res));
                callback(null, res);
            }
        }
    );
}

function getDatesOfImages(callback) {
    var res = {};
    async.mapSeries(
        images,
        function(image, callback) {
            var imagePath = Common.imagesPath + "/" + image;
            fs.stat(imagePath, function(err, stat) {
                if(err) {
                    if(err.code === "ENOENT") {
                        res[image] = {creationFile: 0};
                        callback(null);
                    } else {
                        callback(err);
                    }
                } else {
                    res[image] = {creationFile: stat.birthtime};
                    callback(null);
                }
            });
        },
        function(err, results) {
            callback(err, res);
        }
    );
}

function getDatesOfSnapshots(callback) {
    var res = {};
    async.mapSeries(
        images,
        function(image, callback) {
            var snapshotParam = {
                Filters: [
                    {
                        Name: "tag:Name",
                        Values: [image]
                    }
                    //{
                    //    Name: "tag"
                    //    Values: ["Name=" + image]
                    //}
                ]
            };
            ec2.describeSnapshots(snapshotParam, function(err, data) {
                //console.log("getDatesOfSnapshots: ", data);
                if(err) {
                    callback(err);
                } else {
                    if(data.Snapshots.length === 0) {
                        res[image] = {StartTime: 0, SnapshotId: null};
                        callback(null);
                    } else {
                        var snaps = _.sortBy(data.Snapshots, function(obj) {return new Date(obj.StartTime).getTime();});
                        var lastSnap = snaps[snaps.length-1];
                        res[image] = _.pick(lastSnap, "StartTime", "SnapshotId");
                        callback(null);
                    }
                }
            });
        },
        function(err) {
            callback(err, res);
        }
    );
}

function compareDatesOfImagesAndSnapshots(callback) {
    async.parallel(
        {
            file: function(callback) {
                getDatesOfImages(function(err, res) {
                    console.log("getDatesOfSnapshots: " + JSON.stringify(res));
                    callback(err, res);
                });
            },
            snap: function(callback) {
                getDatesOfSnapshots(function(err, res) {
                    console.log("getDatesOfSnapshots: " + JSON.stringify(res));
                    callback(err, res);
                });
            }
        }, function(err, res) {
            if(err) {
                callback(err);
            } else {
                console.log("compareDatesOfImagesAndSnapshots: " + JSON.stringify(res));
                var SnapshotesObj = {};
                var needUpdateFlags = _.map(images, function(image) {
                    var needUpdateFlag = (new Date(res.file[image].creationFile) > new Date(res.snap[image].StartTime));
                    SnapshotesObj[image] = {
                        needUpdateFlag: needUpdateFlag,
                        SnapshotId: res.snap[image].SnapshotId
                    };
                    return needUpdateFlag;
                });
                console.log("needUpdateFlag: " + JSON.stringify(needUpdateFlags));
                console.log("needUpdateFlag: " + JSON.stringify(SnapshotesObj));
                callback(null, SnapshotesObj);
            }
        }
    );
}

function updateSnapshotOfImage(image, awsMetadata, callback) {
    var imagesSnapshotsMountMap = getImagesSnapshotsMountMap();
    if(!awsMetadata.volumes[image].Attachment_Device) {
        callback("volume of " + image + " does not attached");
        return;
    }
    var mountImageAndVolume = function(callback) {
        async.parallel(
            [
                function(callback) {
                    var args = [
                        "-o", "loop,ro",
                        imagesSnapshotsMountMap[image].imageSrc,
                        imagesSnapshotsMountMap[image].imageDst
                    ];
                    execFile("mount", args, function(err) {
                        callback(err);
                    });
                },
                function(callback) {
                    var args = [
                        awsMetadata.volumes[image].Attachment_Device,
                        imagesSnapshotsMountMap[image].volumeDst
                    ];
                    execFile("mount", args, function(err) {
                        callback(err);
                    });
                }
            ], callback
        );
    };
    var syncImageToVolume = function(callback) {
        var args = [
            "-ra", "--progress", "--inplace",
            imagesSnapshotsMountMap[image].imageDst + "/",
            imagesSnapshotsMountMap[image].volumeDst + "/"
        ];
        var sync_proc = require('child_process').spawn(
            "rsync", args,
            {stdio: [ 'ignore', process.stdout, process.stderr ]}
        );
        sync_proc.on('close', function (code) {
            callback(code ? code : null);
        });
    };
    var umountImageAndVolume = function(callback) {
        async.parallel(
            [
                function(callback) {
                    var args = [
                        imagesSnapshotsMountMap[image].imageDst
                    ];
                    execFile("umount", args, function(err) {
                        callback(err);
                    });
                },
                function(callback) {
                    var args = [
                        imagesSnapshotsMountMap[image].volumeDst
                    ];
                    execFile("umount", args, function(err) {
                        callback(err);
                    });
                }
            ], callback
        );
    };
    var createSnapshotOfVolume = function(callback) {
        async.waterfall(
            [
                function(callback) {
                    console.log("createSnapshotOfVolume call createSnapshot");
                    var params = {
                        Description: "" + image + " snapshot for " + awsMetadata.instanceId, 
                        VolumeId: awsMetadata.volumes[image].VolumeId
                    };
                    ec2.createSnapshot(params, function(err, data) {
                        if (err) {
                            callback(err);
                        } else {
                            console.log("createSnapshotOfVolume finish data: " + JSON.stringify(data));
                            callback(null, data.SnapshotId);
                        }
                    });
                },
                function(SnapshotId, callback) {
                    console.log("createSnapshotOfVolume call createTags");
                    var params = {
                        Resources: [SnapshotId], 
                        Tags: [
                            {
                                Key: "Name", 
                                Value: image
                            }
                        ]
                    };
                    ec2.createTags(params, function(err, data) {
                        callback(err, SnapshotId);
                    });
                }
            ], function(err, snapid) {
                console.log("createSnapshotOfVolume finish");
                if(err) {
                    console.log("createSnapshotOfVolume failed with err: " + JSON.stringify(err));
                    callback(err);
                } else {
                    callback(null, snapid);
                }
            }
        );
    };
    var waitSnapshotReady = function(SnapshotId, timeoutSec, callback) {
        var timeoutFlag = false;
        var timeoutObj = setTimeout(function() {
            timeoutFlag = true;
        }, timeoutSec * 1000); // setTimeout
        var checkSnapshotReady = function(callback) {
            var snapshotParam = {
                SnapshotIds: [SnapshotId]
            };
            ec2.describeSnapshots(snapshotParam, function(err, data) {
                if(err) {
                    callback(err);
                } else {
                    if(data.Snapshots.length === 0) {
                        console.log("checkSnapshotReady: error, missed snapshot " + SnapshotId);
                        callback(null);
                    } else if(data.Snapshots.length === 1) {
                        if(data.Snapshots[0].Progress === "100%") {
                            callback("Done");
                        } else {
                            console.log("checkSnapshotReady: progress of snapshot " + SnapshotId + ": " + data.Snapshots[0].Progress);
                            callback(null);
                        }
                    } else {
                        callback("Duplicate snapshots for " + image)
                    }
                }
            });
        };
        async.whilst(
            function () { return !timeoutFlag; },
            function (callback) {
                setTimeout(function () {
                    checkSnapshotReady(callback);
                }, 20 * 1000);
            },
            function (err, n) {
                if(err === "Done") {
                    callback(null);
                } else {
                    callback("timeout on waiting snapshot " + SnapshotId + " ready");
                }
            }
        );
    };
    var new_snapid;
    
    /////////////////
    //START CODE HERE
    /////////////////
    async.series(
        [
            function(callback) {
                mountImageAndVolume(callback);
            },
            function(callback) {
                syncImageToVolume(callback);
            },
            function(callback) {
                umountImageAndVolume(callback);
            },
            function(callback) {
                createSnapshotOfVolume(function(err, snapid) {
                    if(!err) new_snapid = snapid;
                    callback(null);
                });
            },
            function(callback) {
                console.log("updateSnapshotOfImage call waitSnapshotReady");
                waitSnapshotReady(new_snapid, 20*60, callback);
            }
        ], function(err) {
            console.log("updateSnapshotOfImage finish");
            if(err) {
                console.log("updateSnapshotOfImage failed with err: " + JSON.stringify(err));
                callback(err);
            } else {
                callback(null, new_snapid);
            }
        }
    )
}

function updateNeccessarySnapshots(SnapshotesObj, awsMetadata, callback) {
    async.mapSeries(
        images,
        function(image, callback) {
            if(SnapshotesObj[image].needUpdateFlag) {
                updateSnapshotOfImage(image, awsMetadata, function(err, snapid) {
                    if(err) {
                        callback(err);
                    } else {
                        SnapshotesObj[image].SnapshotId = snapid;
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        },
        function(err) {
            if(err) {
                console.log("updateNeccessarySnapshots failed with err: " + JSON.stringify(err));
                callback(err);
            } else {
                callback(null, SnapshotesObj);
            }
        }
    );
}

function createAmi(SnapshotesObj, awsMetadata, callback) {
    async.waterfall(
        [
            function(callback) {
                var params = {
                    Filters: [
                        {
                            Name: 'name',
                            Values: ['Nubo Platform for ' + awsMetadata.instanceId]
                        }
                    ]
                };
                ec2.describeImages(params, function(err, data) {
                    if(err) {
                        callback(err);
                    } else if(data.Images.length === 0) {
                        callback(null, null);
                    } else {
                        callback(null, data.Images[0].ImageId);
                    }
                });
            },
            function(ImageId, callback) {
                if(ImageId) {
                    console.log("Deregister old AMI " + ImageId);
                    var params = {
                        ImageId: ImageId
                    };
                    ec2.deregisterImage(params, function(err, data) {
                        console.log("response of deregister old AMI " + JSON.stringify(data));
                        callback(null); //sometime we get old already deregistered ImageId
                    });
                } else {
                    callback(null);
                }
            },
            function(callback) {
                var params = {
                    Name: 'Nubo Platform for ' + awsMetadata.instanceId,
                    Architecture: 'x86_64',
                    BlockDeviceMappings: [
                        {
                            DeviceName: '/dev/sda1',
                            Ebs: {
                                //DeleteOnTermination: true || false,
                                //Encrypted: true || false,
                                //Iops: 0,
                                SnapshotId: SnapshotesObj["linux.img"].SnapshotId,
                                //VolumeSize: 0,
                                //VolumeType: 'standard | io1 | gp2 | sc1 | st1'
                            },
                            //NoDevice: 'STRING_VALUE',
                            //VirtualName: 'STRING_VALUE'
                        },
                        {
                            DeviceName: '/dev/sdb',
                            Ebs: {
                                SnapshotId: SnapshotesObj["system.img"].SnapshotId,
                            }
                        },
                        {
                            DeviceName: '/dev/sdc',
                            Ebs: {
                                SnapshotId: SnapshotesObj["userdata.img"].SnapshotId,
                            }
                        },
                        {
                            DeviceName: '/dev/sdd',
                            Ebs: {
                                SnapshotId: SnapshotesObj["cache.img"].SnapshotId,
                            }
                        }
                    ],
                    //Description: 'STRING_VALUE',
                    //DryRun: true || false,
                    //EnaSupport: true || false,
                    //ImageLocation: 'STRING_VALUE',
                    //KernelId: 'STRING_VALUE',
                    //RamdiskId: 'STRING_VALUE',
                    RootDeviceName: '/dev/sda1',
                    //SriovNetSupport: 'STRING_VALUE',
                    VirtualizationType: 'hvm'
                };
                ec2.registerImage(params, function(err, data) {
                    if(err) {
                        callback(err);
                    } else {
                        callback(null, data.ImageId);
                    }
                });
            }
        ], function(err, ImageId) {
            if(err) {
                console.log("createAmi failed with err: " + JSON.stringify(err));
                callback(err);
            } else {
                console.log("createAmi ImageId: " + ImageId);
                callback(null, ImageId);
            }
        }
    );
}

function updateSettingJson(ImageId, callback) {
    var args = [
        "s/\"ImageId\": .*,/\"ImageId\": \"" + ImageId + "\",/g",
        "-i",
        "Settings.json"
    ];
    execFile("sed", args, function(err) {
        callback(err);
    });
}

Common.loadCallback = function(err, firstTime) {
    if(!firstTime) return;

    AWS.config.update(Common.awsConfig);
    ec2 = new AWS.EC2();
    var awsMetadata;

    async.waterfall(
        [
            function(callback) {
                getCurrentAwsData(function(err, data) {
                    if(err) {
                        callback(err);
                    } else {
                        awsMetadata = data;
                        callback(null);
                    }
                });
            },
            function(callback) {
                compareDatesOfImagesAndSnapshots(callback);
            },
            function(SnapshotesObj, callback) {
                if(
                    SnapshotesObj["linux.img"].needUpdateFlag ||
                    SnapshotesObj["system.img"].needUpdateFlag || 
                    SnapshotesObj["userdata.img"].needUpdateFlag || 
                    SnapshotesObj["cache.img"].needUpdateFlag
                ) {
                    callback(null, SnapshotesObj);
                } else {
                    console.log("template already updated... ");
                    callback("template already updated");
                }
            },
            function(SnapshotesObj, callback) {
                updateNeccessarySnapshots(SnapshotesObj, awsMetadata, callback);
            },
            function(SnapshotesObj, callback) {
                createAmi(SnapshotesObj, awsMetadata, callback);
            },
            function(ImageId, callback) {
                updateSettingJson(ImageId, callback);
            }
        ], function(err) {
            var exitCode;
            if(err) {
                if(err === "template already updated") {
                    console.log(err);
                    exitCode = 0;
                } else {
                    console.log("script failed with err: " + err);
                    exitCode = 1;
                }
            } else {
                console.log("Done");
                exitCode = 0;
            }
            setTimeout(function() {
                process.exit(exitCode);
            }, 1000);
        }
    );
}

