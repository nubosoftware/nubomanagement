"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var async = require('async');
var commonUtils = require('./commonUtils.js');
const { Op } = require('sequelize');

function createUserApplicationNotif(email, domain) {

    var notifArray = ["Calendar","Email","Messaging"];
    async.each(notifArray, function(row, callback) {

        Common.db.UserApplicationNotifs.findAll({
            attributes : ['email'],
            where : {
                appname    : row,
                email      : email,
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                callback(err);
                return;
            }

            if (!results || results == "") {

                // Insert new entry to database
                Common.db.UserApplicationNotifs.create({
                    maindomain : domain,
                    email : email,
                    appname : row,
                    sendnotif : 1
                }).then(function(results) {
                    callback(null);
                }).catch(function(err) {
                    var msg = "can't create notification status for " + row + ", error is:" + err;
                    callback(msg);
                    return;
                });
            } else {
                callback(null);
                return;
            }
        });
    });
}

function checkUserDomain(email, callback) {
    //calculate the domain from the user
    var domain;
    getUserDomain(email, function (orgDomainFromDB ) {
        if (orgDomainFromDB)
            domain = orgDomainFromDB;
        else
            domain = email.substr(email.indexOf('@') + 1);

        //look for org with the same manin domain
        Common.db.Orgs.findAll({
            attributes : ['authtype', 'orgname', 'serverurl', 'securessl', 'signature'],
            where : {
                maindomain : domain
            },
        }).complete(function(err, results) {

            if (!!err) {
                var msg = "Error while checkUserDomain while selecting main domain: " + err;
                logger.info(msg);
                callback(msg, domain);
                return;
            }

            if (results.length < 1 || results[0].count < 2 || results[0].authtype == null || results[0].authtype == "") {
                callback("Domain not found", domain);
            } else {
                callback(null, domain);
            }
        });
    });
}

function setUserDetails(email, firstName, lastName, jobTitle, callback) {
    logger.info("Update user " + email + ", firstName: " + firstName + ", lastName:" + lastName + ", jobTitle:" + jobTitle);

    if (Common.withService) {
        Common.db.User.update({
            firstname : firstName,
            lastname : lastName,
            jobtitle : jobTitle
        }, {
            where : {
                email : email
            }
        }).then(function() {
            callback(null, email, firstName, lastName, jobTitle);
            // return data withno error
        }).catch(function(err) {
            var msg = "Error while setUserDetails: " + err;
            logger.info(msg);
            callback(msg);
            // return error
            return;
        });
    } else {

        Common.db.User.update({
            firstname : firstName,
            lastname : lastName,
            jobtitle : jobTitle,
            username : email
        }, {
            where : {
                email : email
            }
        }).then(function() {
            callback(null, email, firstName, lastName, jobTitle);
            // return data withno error
        }).catch(function(err) {
            var msg = "Error while setUserDetails: " + err;
            logger.info(msg);
            callback(msg);
            // return error
            return;
        });
    }

}

function getUserDetails(email, callback) {

    Common.db.User.findAll({
        attributes : ['email', 'firstname', 'lastname', 'jobtitle'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            var msg = "Error while getUserDetails: " + err;
            logger.info(msg);
            callback(msg);
            // return error
            return;
        }

        if (results.length < 1 || results[0].count < 3) {
            var msg = "Error while getUserDetails: email not found:" + email;
            logger.info(msg);
            callback(msg);
            // return error
            return;
        }

        logger.info("user: " + results[0].email);
        var firstName = results[0].firstname != null ? results[0].firstname : '';
        var lastName = results[0].lastname != null ? results[0].lastname : '';
        var jobTitle = results[0].jobtitle != null ? results[0].jobtitle : '';
        callback(null, firstName, lastName, jobTitle);
        // return existing user data
    });

}

/**
 * Return few details about the user that require for activation
 * @param {*} email 
 * @returns 
 */
function getUserDetailsPromise(email) {
    return new Promise((resolve, reject) => {
        getUserDetails(email,function(err,firstName, lastName, jobTitle) {
            if (err) {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    reject(new Error(err));                    
                }
                return;
            }
            resolve({
                firstName, lastName, jobTitle
            });
        });
    });
}

function getUserDeviceDataFolder(email, deviceid) {

    var folder = commonUtils.buildPath(getUserHomeFolder(email), deviceid);

    return folder;
}

function getUserDeviceDataFolderObj(email, deviceid){

     return {
        root: getUserHomeFolder(email),
        folder: deviceid
     };
}

function getUserStorageFolder(email) {
    var folder = commonUtils.buildPath(getUserHomeFolder(email), 'storage');
    return folder;
}

function getUserStorageFolderObj(email) {
     return {
        root: getUserHomeFolder(email),
        folder: 'storage'
     };
}

function getDomainFolder(email) {
    var re = new RegExp('(.*)@(.*)');
    var m = re.exec(email);
    var domain = "none";
    if (m != null && m.length >= 3) {
        domain = m[2];
    }
    var folder = commonUtils.buildPath(domain, '/');
    return folder;
}

function getUserHomeFolder(email) {
    var re = new RegExp('(.*)@(.*)');
    var m = re.exec(email);
    var domain = "none";
    if (m != null && m.length >= 3) {
        domain = m[2];
    }
    var folder = commonUtils.buildPath(domain, email, '/');
    return folder;
}

function updateUserConnectedDevice(email, imei, platform, gateway, logger, callback) {

    if (platform && !gateway) {
        gateway = "-1";
    }
    let values = {
        platform: platform,
        gateway: gateway
    };

    if (platform && gateway) {
        values.last_login = new Date()
    }


    Common.db.UserDevices.update(values, {
        where: {
            email: email,
            imei: imei
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        var errMsg = 'updateUserConnectedDevice: ' + err;
        logger.error(errMsg);
        callback(errMsg);
    });

}

function getUserConnectedDevices(email, logger, callback) {

    Common.db.UserDevices.findAll({
        attributes: ['email', 'imei', 'platform', 'gateway'],
        where: {
            email: email,
            platform: {
                [Op.ne]: null
            },
            gateway: {
                [Op.ne]: null
            }
        }
    }).complete(function(err, results) {

        if (!!err) {
            var errMsg = 'getUserConnectedDevices: ' + err;
            logger.error(errMsg);
            callback(errMsg);
            return;
        }

        // return all connected devices of the user
        callback(null, results);
    });

}

function isUseDeviceConnected(email, imei, logger, callback) {

    Common.db.UserDevices.findAll({
        attributes: ['email', 'imei', 'platform', 'gateway'],
        where: {
            email: email,
            imei: imei,
            platform: {
                [Op.ne]: null
            },
            gateway: {
                [Op.ne]: null
            }
        }
    }).complete(function(err, results) {

        if (!!err) {
            var errMsg = 'isUseDeviceConnected: ' + err;
            logger.error(errMsg);
            callback(errMsg);
            return;
        }

        if (results[0] != null) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    });
}

function clearUserConnectedDevice(email, logger, callback) {

    Common.db.UserDevices.update({
        platform: null,
        gateway: null
    }, {
        where: {
            email: email
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        var errMsg = 'clearUserConnectedDevice: ' + err;
        logger.error(errMsg);
        callback(errMsg);
    });

}

function updateUserDataCenter(email, dcname, dcurl, logger, callback) {

    Common.db.User.update({
        dcname: dcname,
        dcurl: dcurl
    }, {
        where: {
            email: email
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        var errMsg = 'updateUserDataCenter: ' + err;
        logger.error(errMsg);
        callback(errMsg);
    });

}

function getUserDataCenter(email, logger, callback) {

    Common.db.User.findAll({
        attributes: ['dcname', 'dcurl'],
        where: {
            email: email
        },
    }).complete(function(err, results) {

        if (!!err) {
            var errMsg = 'getUserDataCenter: ' + err;
            logger.error(errMsg);
            callback(errMsg);
            return;
        }

        // goes here if we don't find this profile in the database
        if (results.length < 1) {
            var errMsg = 'getUserDataCenter: cannot find user: ' + email;
            logger.error(errMsg);
            callback(errMsg);
            return;

        }

        callback(null, results[0].dcname, results[0].dcurl);
    });
}

function getUserDomain(email, callback) {
    //read the domain from the database

    Common.db.User.findAll({
        attributes : ['orgdomain'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            var msg = "getUserDomain: Error while selecting orgdomain: " + err;
            logger.info(msg);
            callback(null);
            return;
        } else if (!results || results == "") {
            var msg = "getUserDomain: user does not exist in database";
            logger.info(msg);
            callback(null);
            return;

        } else {
            var orgdomain = results[0].orgdomain
            //var msg = "getUserDomain: found orgdomain = " + orgdomain;
            //logger.info(msg);
            callback(orgdomain);
        }
    });
}


/**
 * Get orgdomain from user. If user does not exists - parse the domain from the email address
 * @param {} email 
 * @returns 
 */
function getUserDomainPromise(email) {
    return new Promise((resolve, reject) => {
        getUserDomain(email,function(orgdomain) {
            let emailDomain;
            if (orgdomain)
                emailDomain = orgdomain;
            else
                emailDomain = email.substr(email.indexOf('@') + 1);
            resolve(emailDomain);
        });
    });
}

function getUserObj(email, callback) {
    //read the domain from the database

    Common.db.User.findAll({
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            var msg = "getUserDomain: Error while getUserObj: " + err;
            logger.info(msg);
            callback({
                email: email
            });
            return;
        } else if (!results || results == "") {
            var msg = "getUserDomain: user does not exist in database";
            logger.info(msg);
            callback({
                email: email
            });
            return;

        } else {
            callback(results[0]);
        }
    });
}

/**
 * Get User object. if user does not exists return empty object just with the email
 * @param {*} email 
 */
async function getUserObjPromise(email) {
    let obj = await Common.db.User.findOne({      
        where: {
            email: email                                   
        },
    });
    if (obj == null) {
        return {
            email: email
        };
    } else {
        return(obj);
    }
}

function getHideNuboAppName(packagename, domain, callback) {

    Common.db.Apps.findAll({
        attributes : ['appname'],
        where : {
            packagename : packagename,
            maindomain : domain
        },
    }).complete(function(err, results) {

        if (!!err) {
            logger.error(msg);
            callback(err, null);
            return;
        }

        if (results.length < 1) {
            var msg = "getHideNuboAppName is null or empty";
            logger.error(msg);
            callback(msg);
            return;
        }

        var appName = results[0].appname != null ? results[0].appname : '';
        callback(null,appName);
        return;
    });
}

function getUserNotificationsStatusForAllApps(email, callback) {
    var resCnt = 0;

    Common.db.UserApplicationNotifs.findAll({
        attributes : ['appname','maindomain','email','sendnotif'],
        where : {
            email      : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback(err);
            return;
        }
        var buffer = '"appsNotifStatus":[';
        results.forEach(function(row) {

            // get all values of current row
            var appName = row.appname != null ? row.appname : '';
            var sendNotif = row.sendnotif != null ? row.sendnotif : '';

            var jsonNotifApp = {
                    appName : appName,
                    sendNotif : sendNotif
            };

            // separates every jsonUser
            if (resCnt > 0) {
                buffer += ',';
            }

            resCnt += 1;

            buffer += JSON.stringify(jsonNotifApp);

        });

        buffer += ']';
        callback(null,buffer);
        return;
    });

}

function updateUserDeviceVpnState(user, deviceid, state, logger, callback){

    Common.db.UserDevices.update({
        vpnstate: state
    }, {
        where: {
            email: user,
            imei: deviceid
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        var errMsg = 'updateUserDeviceVpnState: ' + err;
        logger.error(errMsg);
        callback(err);
    });
}

function updateUserDeviceVpn(user, deviceid, profileName, state, client, logger, callback){

    Common.db.UserDevices.update({
        vpnstate: state,
        vpnprofilename: profileName,
        vpnclient: client
    }, {
        where: {
            email: user,
            imei: deviceid
        }
    }).then(function() {
        callback(null);
    }).catch(function(err) {
        var errMsg = 'updateUserDeviceVpn: ' + err;
        logger.error(errMsg);
        callback(err);
    });
}

function getAllUserDevices(email, logger, callback) {

    Common.db.UserDevices.findAll({
        attributes: ['imei'],
        where: {
            email: email
        }
    }).complete(function(err, results) {

        if (!!err) {
            var errMsg = 'getAllUserDevices: ' + err;
            logger.error(errMsg);
            callback(errMsg);
            return;
        }

        callback(null, results);
    });
}

function getUserDeviceVpn(email, deiviceId, logger, callback) {

    Common.db.UserDevices.findAll({
        attributes: ['vpnprofilename', 'vpnstate', 'vpnclient'],
        where: {
            email: email,
            imei: deiviceId
        }
    }).complete(function(err, results) {

        if (!!err) {
            var errMsg = 'getUserDeviceVpn: ' + err;
            logger.error(errMsg);
            callback(errMsg);
            return;
        }

        if (results.length < 1) {
            var msg = "getUserDeviceVpn: user device not exist in database";
            logger.error(msg);
            callback(msg);
            return;
        }

        callback(null, results[0]);
    });
}

function getUserOrgCredentials(email, logger, callback) {
    Common.db.User.findAll({
        attributes : ['orgpassword', 'orguser'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            var msg = "getUserOrgCredentials: " + err;
            logger.info(msg);
            callback(null);
            return;
        }

        if (results.length < 1) {
            var msg = "getUserOrgCredentials: user does not exist in database";
            logger.error(msg);
            callback(msg);
            return;
        }

        var decOrgPassword = Common.dec(results[0].orgpassword);

        callback(null, results[0].orguser, decOrgPassword);

    });
}

function clearUserDataCenterData(email, logger, callback) {

    async.series([
        function(callback) {
            updateUserDataCenter(email, null, null, logger, callback);
        },
        function(callback) {
            clearUserConnectedDevice(email, logger, callback);
        }
    ], function(err) {
        if (err) {
            logger.error("clearUserDataCenterData: " + err);
            callback("failed to clear user data of " + email);
            return;
        }

        callback(null);
    });
}

var User = {
    setUserDetails : setUserDetails,
    getUserDetails : getUserDetails,
    getUserHomeFolder : getUserHomeFolder,
    getUserStorageFolder : getUserStorageFolder,
    getUserDeviceDataFolder : getUserDeviceDataFolder,
    checkUserDomain : checkUserDomain,
    createUserApplicationNotif : createUserApplicationNotif,
    updateUserConnectedDevice: updateUserConnectedDevice,
    getUserConnectedDevices: getUserConnectedDevices,
    isUseDeviceConnected: isUseDeviceConnected,
    updateUserDataCenter: updateUserDataCenter,
    getUserDataCenter: getUserDataCenter,
    getUserDomain : getUserDomain,
    getUserDeviceDataFolderObj: getUserDeviceDataFolderObj,
    getUserStorageFolderObj: getUserStorageFolderObj,
    getHideNuboAppName : getHideNuboAppName,
    getUserNotificationsStatusForAllApps: getUserNotificationsStatusForAllApps,
    updateUserDeviceVpnState: updateUserDeviceVpnState,
    getAllUserDevices: getAllUserDevices,
    updateUserDeviceVpn: updateUserDeviceVpn,
    getUserDeviceVpn: getUserDeviceVpn,
    getUserOrgCredentials: getUserOrgCredentials,
    clearUserDataCenterData: clearUserDataCenterData,
    getUserObj,
    getDomainFolder,
    getUserDomainPromise,
    getUserDetailsPromise,
    getUserObjPromise
};

module.exports = User;

