"use strict";

/*  @autor Ori Sharon
 *  in this class we get all details / apps / devices that are associated within a specific profile.
 *  we send the email of the requested profile and receive its details
 */

var _ = require('underscore');
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var async = require('async');
var setting = require('../settings.js');
var UserModule = require('../user.js');
var syslog = require('./syslog/DBProcess.js');
var checkCert = require('./checkCertificate.js');
var userUtils = require('../userUtils.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

// first call goes to here
function getProfileDetails(req, res, next) {
    // https://login.nubosoftware.com/getProfileDetails?session=[]&email=[email]&email=[email]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || !validateEmail(email)) {
        logger.info("getProfileDetails. Invalid email " + email);
        status = 0;
        msg = "Invalid parameters";
    }

    if (status != 1) {
        res.send({
            status : status,
            message : msg
        });
        return;
    }

    loadAdminParamsFromSession(req, res, function(err, login) {

        if (!setting.getDebugMode()) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }


        let webCP = (req.nubodata.adminLogin ? true : false);
        getProfileDetailsFromDB(res, email, domain,webCP);

    });

}

function validateEmail(email) {
    // http://stackoverflow.com/a/46181/11236
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

function getProfileDetailsFromDB(res, email, domain,webCP) {

    var details;
    var apps = [];
    var devices = [];
    var groups = [];
    var errormsg;
    var user_row;

    // this call (async) is to perform this in a synchronic way
    async.series([
    // get user details
    function(callback) {

        Common.db.User.findAll({
            attributes : ['firstname', 'lastname','isactive', 'officephone', 'mobilephone', 'manager', 'country', 'dcname', 'storageLimit', 'storageLast', 'isimadmin', 'im_mobile', 'im_mobile2', 'addomain', 'username', 'clientip', 'clientport', 'subscriptionid', 'subscriptionupdatedate', 'lastactivity','recording',
               'orguser','orgemail','serverurl','securessl'],
            where : {
                email : email,
                orgdomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                logger.error("err:: " + err);
                errormsg = 'Error on get user details: ' + err;
                callback(errormsg);
                return;

                // goes here if we don't find this profile in the database
            } else if (!results || results == "") {
                errormsg = 'Cannot find user: ' + email;
                callback(errormsg);
                return;

            } else {
                user_row = results[0];
                // run on each row in database and bring email / first / last / isactive / imageurl variables
                async.each(results, function(row, callback) {
                    // gets all data of the required profile
                    var userName = row.username != null ? row.username : '';
                    var isActive = row.isactive != null ? row.isactive : 0;
                    var officePhone = row.officephone != null ? row.officephone : '';
                    var mobilePhone = row.mobilephone != null ? row.mobilephone : '';
                    var manager = row.manager != null ? row.manager : '';
                    var country = row.country != null ? row.country : '';
                    var isImAdmin = row.isimadmin != null ? row.isimadmin : '';
                    var imMobile = row.im_mobile != null ? row.im_mobile : '';
                    var imMobile2 = row.im_mobile2 != null ? row.im_mobile2 : '';
                    var adDomain = row.addomain != null ? row.addomain : '';
                    var clientIp = row.clientip != null ? row.clientip : '';
                    var clientPort = row.clientport != null ? row.clientport : '';
                    var subscriptionId = row.subscriptionid != null ? row.subscriptionid : '';
                    var subscriptionUpdateDate = row.subscriptionupdatedate != null ? row.subscriptionupdatedate : '';
                    var dataCenter = row.dcname != null ? row.dcname : '';
                    var lastactivity = row.lastactivity != null ? row.lastactivity : '';
                    var firstname = row.firstname != null ? row.firstname : '';
                    var lastname = row.lastname != null ? row.lastname : '';
                    var Calendar = 1;
                    var Email = 1;
                    var Messaging = 1;
                    var DisableSound = 1;

                    checkCert.checkIfCertificateIsInNFS(email, null, false, function(exists) {

                        details = {
                            emailAddress : email,
                            userName : userName,
                            isActive : isActive,
                            officePhone : officePhone,
                            mobilePhone : mobilePhone,
                            manager : manager,
                            country : country,
                            isImAdmin : isImAdmin,
                            dataCenter : dataCenter,
                            imMobile : imMobile,
                            imMobile2 : imMobile2,
                            adDomain : adDomain,
                            clientIp : clientIp,
                            clientPort : clientPort,
                            subscriptionId : subscriptionId,
                            subscriptionUpdateDate : subscriptionUpdateDate,
                            Calendar : Calendar,
                            Email : Email,
                            Messaging : Messaging,
                            userCert : exists,
                            lastActivityTime : lastactivity,
                        };
                        if (webCP) {
                            _.extend(details, _.pick(row, 'recording', 'orguser', 'orgemail', 'serverurl', 'securessl'));
                            details.firstname = firstname;
                            details.lastname = lastname;
                            // details.recording = row.recording;
                        }
                        callback(null);
                    });
                }, function(err) {
                    callback(null);
                });
                return;
            }
        });
    },

    function(callback) {
        Common.db.UserApplicationNotifs.findAll({
            attributes : ['appname','sendnotif'],
            where : {
                email : email,
                maindomain : domain
            },
        }).complete(function(err, results) {
            if (!!err) {
                errormsg = 'Error on get user notifications: ' + err;
                logger.error(errormsg);
                callback(err);
                return;

                // goes here if we don't find this profile in the database
            } else if (!results || results == "") {
                callback(null);
                return;
            } else {
                // run on each row in database and bring appName / sendNotif variables
                var isMessaging = false;
                results.forEach(function(row) {

                    // gets all data of the required profile
                    var appName = row.appname != null ? row.appname : '';
                    var sendNotif = row.sendnotif != null ? row.sendnotif : 0;

                    // this is for backwards compatability
                    if (appName == "Messaging") {
                        isMessaging = true;
                    }

                    if (appName == "Messenger") {
                        if (!isMessaging) {
                            appName = "Messaging";
                            details[appName] = sendNotif;
                        }
                    } else {
                        details[appName] = sendNotif;
                    }
            });
                callback(null);
            }
        });
    },

    function(callback) {
        getStorageUsage(user_row, function(err, res) {
            details.storageUsage = res;
            callback(null);
        });
    },

    // get app name
    function(callback) {

        Common.db.UserApps.findAll({
            attributes : ['packagename', 'private'],
            where : {
                email : email,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                logger.error("err:: " + err);
                errormsg = 'Error on get packageName: ' + err;
                callback(errormsg);
                return;

            } else {
                // run on each row in database and bring packagename variable
                results.forEach(function(row) {

                    var packageName = row.packagename;
                    var privateApp = row.private;

                    // get all apps of current profile
                    getAppsForProfile(packageName, privateApp, apps, domain, function(err, results) {
                        if (err) {
                            errormsg = 'Error on get app details ' + err;
                            callback(errormsg);
                            return;
                        }
                    });

                });
                callback(null);
            }
        });
    },
    // get devices
    function(callback) {
        Common.db.UserDevices.findAll({
            attributes : ['devicename', 'active', 'imei', 'inserttime', 'imsi', 'gateway', 'platform','localid',"active_session"],
            order: [['platform','DESC']],
            where : {
                email : email,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                errormsg = 'Error on get user devices: ' + err;
                logger.error(errormsg);
                callback(errormsg);
                return;

            } else {
                // run on each row in database and bring devicename / isactive / imei variables
                async.each(results, function(row, callback) {
                    var deviceName = row.devicename != null ? row.devicename : '';
                    var isActive = row.active != null ? row.active : '';
                    var gateway = row.gateway != null ? row.gateway : '';
                    var platform = row.platform != null ? row.platform : '';
                    var imei = row.imei != null ? row.imei : '';
                    var imsi = row.imsi != null ? row.imsi : '';
                    var insertTime = row.inserttime != null ? row.inserttime : '';
                    var localid = row.localid > 0 ? row.localid : '';
                    var active_session = row.active_session == 1 ? true : false;

                    var isOnline = 0;
                    if (/*platform && platform.length > 0 && gateway && gateway.length > 0*/ active_session) {
                        isOnline = 1;
                    }

                    var isCertExists;
                    checkCert.checkIfCertificateIsInNFS(email, imei, false, function(exists) {
                        isCertExists = exists;

                        var jsonProfileDevice = {
                            deviceName : deviceName,
                            isActive : isActive,
                            gateway : gateway,
                            platform : platform,
                            localid: localid,
                            IMEI : imei,
                            IMSI : imsi,
                            insertTime : insertTime,
                            isCertExists : isCertExists,
                            isOnline : isOnline
                        };
                        devices.push(jsonProfileDevice);
                        callback(null);
                    });
                }, function(err) {
                    callback(null);
                });
            }
        });
    },
    // get groups
    function(callback) {

        Common.db.UserGroups.findAll({
            attributes : ['groupname', 'addomain'],
            where : {
                email : email,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                errormsg = 'Error on get user groups: ' + err;
                logger.error(errormsg);
                callback(errormsg);
                return;

            } else {
                // run on each row in database and bring groupname variable
                results.forEach(function(row) {

                    var groupName = row.groupname != null ? row.groupname : '';
                    var adDomain = row.addomain != null ? row.addomain : '';

                    var jsonProfileGroup = {
                        groupName : groupName,
                        adDomain : adDomain
                    };
                    groups.push(jsonProfileGroup);

                });
                callback(null);
            }
        });
    }], function(err, results) {
        if (err) {
            res.send({
                status : '0',
                message : err
            });
            return;
        }

        // response back all details once finish
        var json = JSON.stringify({
            status : "1",
            message : "import succedded",
            details : details,
            apps : apps,
            devices : devices,
            groups : groups
        });

        res.end(json);
        return;

    });

}

function getAppsForProfile(packageName, privateApp, apps, domain, callback) {

    Common.db.Apps.findAll({
        attributes : ['appname', 'packagename', 'imageurl', 'price' , 'versioncode'],
        where : {
            packagename : packageName,
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            errormsg = 'Error on get user apps: ' + err;
            callback(errormsg);
            return;

        } else {
            // run on each row in database and bring packagename variable
            results.forEach(function(row) {

                var appName = row.appname != null ? row.appname : '';
                var packageName = row.packagename != null ? row.packagename : '';
                var imageUrl = row.imageurl != null ? row.imageurl : '';
                var price = row.price != null ? row.price : '';
                var versioncode = row.versioncode != null ? row.versioncode : '0';
                if (!imageUrl || imageUrl == "") {
                    if (Common.appstore && Common.appstore.enable === true) {
                        if (Common.appstore.extURL) {
                            imageUrl = Common.appstore.extURL;
                        } else {
                            imageUrl = Common.appstore.url;
                        }
                    } else {
                        imageUrl = "";
                    }
                    imageUrl += `/${domain}/repo/icons/${packageName}.${versioncode}.png`
                }

                var jsonProfileApp = {
                    appName : appName,
                    packageName : packageName,
                    imageUrl : imageUrl,
                    price : price,
                    privateApp : privateApp
                };
                apps.push(jsonProfileApp);

            });
            callback(null);
        }
    });

}

function getStorageUsage(user_row, callback) {
    var storageUsage;
    if(true) {  //size from database
        var storage = 100*user_row.dataValues.storageLast/user_row.dataValues.storageLimit;
        storageUsage = storage.toFixed(2) + "\%";

        callback(null, storageUsage);
    } else {    // calculate current size
        userUtils.getUserDataSize(
            user_row.__options.whereCollection.email,
            function(err, size) {
                if(err) {
                    logger.error("getProfileDetails.js cannot get user's data size, err: " + err);
                    storageUsage = "???"
                } else {
                    var storage = 100*size/user_row.dataValues.storageLimit;
                    storageUsage = storage.toFixed(2) + "\%";
                }
                callback(null, storageUsage);
            }
        );
    }
}

var GetProfileDetails = {
    get : getProfileDetails
};

module.exports = GetProfileDetails;
