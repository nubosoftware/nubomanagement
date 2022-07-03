var fs = require('fs');
var async = require('async');
var Common = require('./common.js');
var userModule = require('./user.js');
var url = require('url');
var ThreadedLogger = require('./ThreadedLogger.js');
var logger = Common.getLogger(__filename);
var http = require('./http.js');
var AddAdmins = require('./ControlPanel/addAdmins.js');
const NEW_USER_TAR = 'new_user7.tar.gz';
const LINUX_NEW_USER_TAR = 'new_user_linux.tar.gz';
const NEW_USER_DATA_IMG = 'new_user_data.img'

var validate = require("validate.js");
var _ = require('underscore');
var execFile = require('child_process').execFile;
var commonUtils = require('./commonUtils.js');
const { Op } = require('sequelize');
const fsp = fs.promises;

function changeModeOwner(file, opts, callback) {
    async.series(
        [
            function(callback) {
                if (opts.mode) {
                    fs.chmod(file, opts.mode, callback);
                } else {
                    callback(null);
                }
            },
            function(callback) {
                if (opts.owner) {
                    fs.chown(file, opts.owner.uid, opts.owner.gid, callback);
                } else {
                    callback(null);
                }
            }
        ],
        callback
    );
}

function copyFile(src, dst, opts, callback) {
    var reader = Common.fs.createReadStream(src);
    var writer = Common.fs.createWriteStream(dst);
    var isFinished = false;
    reader.pipe(writer);
    writer.on('finish', function() {
        //logger.info("Finished writing to " + dst);
        if (!isFinished)
            changeModeOwner(dst, opts, callback);
    });
    writer.on('error', function(err) {
        logger.error("Error writing to " + dst + ": " + err);
        if (!isFinished) {
            isFinished = true;
            callback("Error writing to " + dst);
        }
    });
    reader.on('error', function(err) {
        logger.error("Error reading from " + src + ": " + err);
        if (!isFinished) {
            isFinished = true;
            callback("Error reading from " + src);
        }
    });
}

//https://login.nubosoftware.com/setAdminInDBRestApi?email=[email]&orgdomain=[]
function setAdminInDBRestApi(req, res, next) {

    res.contentType = 'json';
    var email = req.params.email;
    var orgdomain = req.params.orgdomain;
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user(email);
    setAdminInDB(email, orgdomain, '{"/":"rw"}', logger, function(err) {
        if (err) {
            logger.error("setAdminInDBRestApi: " + err);
            res.send({
                status: 0,
                message: err
            });
            return;
        }

        res.send({
            status: 1,
            message: "created admin successfully"
        });
        return;
    });
}

function setAdminInDB(email, orgdomain, perms, callback) {

    require('./ControlPanel/addAdmins.js').setAdminInDB(email, orgdomain, perms,function(err, status) {
        if (err || status == '0') {
            callback("Failed to add admin");
            return;
        } else {
            callback(null);
            return;
        }
    });
}

function addAppToProfile(domain, email, packageName, isPrivateApp, callback) {
    require('./ControlPanel/addAppsToProfiles.js').addAppsToProfilesInternal(domain, email, packageName, isPrivateApp, 0 ,function(err, status) {
        if (err || status == '0') {
            callback(err);
            return;
        } else {
            callback(null);
            return;
        }
    });
}


function getDefaultApps() {
    let apps = [];
    if (Common.isMobile()) {
        apps = Common.getMobile().appMgmt.getDefaultApps();
    } else if (Common.isDesktop()) {
        apps =  Common.getDesktop().debs.getDefaultApps();
    }
    return apps;
}


var postNewOrgProcedure = function(domain, logger, callback) {
    async.series(
        [
            function(callback) {
                var groupObj = {
                    groupname: "All",
                    maindomain: domain
                };
                logger.info(`postNewOrgProcedure. Add group All for domain ${domain}`);
                require("./ControlPanel/createGroup.js").createGroupInternal(groupObj, [], {
                    logger: logger
                }, function(err) {
                    if (err) {
                        logger.error("createDomainForUser cannot create group All for new domain " + domain + " err: " + err);
                    }
                    callback(null);
                });
            },
            function(callback) {
                if (Common.isMobile()) {
                    logger.info(`postNewOrgProcedure. attachToDomainDefaultApps for domain ${domain}`);
                    Common.getMobile().appMgmt.attachToDomainDefaultApps(domain, logger, function(err) {
                        callback(null);
                    });
                } else if (Common.isDesktop()) {
                    Common.getDesktop().debs.attachToDomainDefaultApps(domain).then(() => {
                        callback(null);
                    }).catch(err => {
                        callback(err);
                    })
                } else {
                    callback(null);
                }
            },
            function(callback) {
                logger.info(`postNewOrgProcedure. add default apps to group All`);
                let defaultApps = [];
                getDefaultApps().forEach(function(item) {
                    if (typeof item == "string") {
                        defaultApps.push(item);
                    } else {
                        if (item.groupAll == true) {
                            defaultApps.push(item.packagename);
                        }
                    }
                });
                require("./ControlPanel/installApps.js").addAppsToGroups(domain, [""], ["All"], defaultApps, 0 , function(err) {
                    if (err) {
                        logger.error("createDomainForUser cannot install apps to group All for new domain " + domain + " err: " + err);
                    }
                    callback(null);
                });
            }, function(callback) {
                // create org appstore repo
                if (Common.appstore && Common.appstore.enable === true) {
                    // Update app store after sucessfull install
                    if (Common.isMobile()) {
                        Common.getMobile().appStore.updateRepo(domain,null,() => {
                            logger.info("Finished update appstore repo for domain: "+domain);
                        });
                    }
                }
                callback();
            }
        ],
        function(err) {
            callback(err);
        }
    );
}

function createDomainForUser(domain, logger, callback) {
    //look for org with the same manin domain
    async.waterfall(
        [
            function(callback) {
                var defaults = {
                    authtype: '0',
                    orgname: '',
                    serverurl: '',
                    securessl: '1',
                    signature: '',
                    watermark: '',
                    recordingall: Common.defaultRecording || '0'
                }

                if (Common.virtualKeyboardEnabled) {
                    defaults.passcodetype = 1,
                    defaults.passcodeminchars = Common.virtualKeyboardPasswordMinChars;
                    defaults.passcodeexpirationdays = Common.virtualKeyboardPasswordExpirationDays;
                }

                Common.db.Orgs.findOrCreate({
                    where: {
                        maindomain: domain
                    },
                    defaults: defaults
                }).complete(function(err, results) {
                    if (!!err) {
                        var msg = "Error while createUser while selecting main domain: " + err;
                        logger.error(msg);
                        callback(msg);
                    } else {
                        callback(null, results);
                    }
                });
            },
            function(results, callback) {
                if (results[1]) {
                    logger.info(`createDomainForUser. Domain created: ${domain}`);
                    postNewOrgProcedure(domain, logger, function(err) {
                        callback(null, results);
                    });
                } else {
                    //logger.info(`createDomainForUser. Domain already exists: ${domain}`);
                    callback(null, results);
                }
            },
            function(results, callback) {
                var org_obj = results[0].dataValues;
                org_obj.maindomain = domain;
                org_obj.authtype = results[0].authtype != null ? results[0].authtype : '0';
                org_obj.orgname = results[0].orgname != null ? results[0].orgname : '';
                org_obj.serverurl = results[0].serverurl != null ? results[0].serverurl : '';
                org_obj.securessl = results[0].securessl != null ? results[0].securessl : '1';
                org_obj.signature = results[0].signature != null ? results[0].signature : '';

                if (Common.virtualKeyboardEnabled) {
                    org_obj.passcodeexpirationdays = Common.virtualKeyboardPasswordExpirationDays || 0;
                    org_obj.passcodeminchars = Common.virtualKeyboardPasswordMinChars || 6;
                    org_obj.passcodetype = 1;
                } else {
                    org_obj.passcodeexpirationdays = results[0].passcodeexpirationdays || 0;
                    org_obj.passcodeminchars = results[0].passcodeminchars || 6;
                    org_obj.passcodetype = results[0].passcodetype || 0;
                }
                org_obj.exchangeencoding = results[0].exchangeencoding || "UTF-8";
                org_obj.owaurl = results[0].owaurl != null ? results[0].owaurl : '';
                org_obj.owaurlpostauth = results[0].owaurlpostauth != null ? results[0].owaurlpostauth : '';
                org_obj.refererurl = results[0].refererurl != null ? results[0].refererurl : '';
                org_obj.recordingall = results[0].recordingall || 0;
                //logger.info(`recordingall: ${org_obj.recordingall}, domain: ${domain}`);
                callback(null, org_obj);
                // return existing domain settings
            }
        ],
        function(err, res) {
            if (err) {
                logger.error("createDomainForUser failed with err: " + err);
            }
            callback(err, res);
        }
    );
}

function createOrReturnUserAndDomain(email, logger, callback,userDomain) {
    //calculate the domain from the user
    var domain;
    userModule.getUserDomain(email, function(orgDomainFromDB) {
        if (orgDomainFromDB) {
            domain = orgDomainFromDB;
        } else if (userDomain) {
            domain = userDomain;
        } else {
            domain = email.substr(email.indexOf('@') + 1);
        }

        createDomainForUser(domain, logger, function(err, org_fixed_obj) {
            if (err) {
                callback(err);
                return;
            }
            //domain, authType, orgName, serverURL, secureSSL, signature

            //logger.info("callback of createDomainForUser %s %s %s %s %s %s ",domain,authType,orgName,serverURL,secureSSL,signature);
            createUser(email, org_fixed_obj, logger, function(err, user_fixed_obj) {
                if (err) {
                    callback(err);
                    return;
                }
                //logger.info("createOrReturnUserAndDomain %s %s %s %s %s %s %s %s %s %s %s", email, domain, authTypeU, orgName, serverURLU, passcode, orgEmail, orgUser, orgPassword, secureSSLU, signatureU);
                var callback_obj = {
                    email: email,
                    firstname: user_fixed_obj.firstname,
                    lastname: user_fixed_obj.lastname,
                    username: user_fixed_obj.username,
                    domain: user_fixed_obj.orgdomain,
                    authType: org_fixed_obj.authtype !== "0" ? org_fixed_obj.authtype : user_fixed_obj.authtype,
                    orgName: org_fixed_obj.orgname,
                    orgEmail: user_fixed_obj.orgemail,
                    passcode: user_fixed_obj.passcode,
                    passcodeupdate: user_fixed_obj.passcodeupdate,
                    passcodeexpirationdays: org_fixed_obj.passcodeexpirationdays,
                    exchange_conf: {
                        orgUser: user_fixed_obj.orguser,
                        orgPassword: user_fixed_obj.orgpassword,
                        serverURL: org_fixed_obj.authtype !== "0" ? org_fixed_obj.serverurl : user_fixed_obj.serverurl,
                        secureSSL: org_fixed_obj.authtype !== "0" ? org_fixed_obj.securessl : user_fixed_obj.securessl,
                        signature: user_fixed_obj.signature
                    },
                    isAdmin: user_fixed_obj.isadmin,
                    lang: user_fixed_obj.lang,
                    countrylang: user_fixed_obj.countrylang,
                    localevar: user_fixed_obj.localevar,
                    encrypted: user_fixed_obj.encrypted,
                    dcname: user_fixed_obj.dcname,
                    dcurl: user_fixed_obj.dcurl,
                    ldap_dn: user_fixed_obj.ldap_dn,
                    addomain: user_fixed_obj.addomain,
                    docker_image: user_fixed_obj.docker_image,
                    recording: user_fixed_obj.recording,

                }
                callback(null, callback_obj, user_fixed_obj, org_fixed_obj);
            });
            // createUser
        });
        //  createDomainForUser
    });

} // createOrReturnUserAndDomain


function createUser(regEmail, org_obj, logger, callback) {
    var domain = org_obj.maindomain;
    var authType = org_obj.authtype;
    var serverURL = org_obj.serverurl;
    var secureSSL = org_obj.securessl;
    var signature = org_obj.signature;

    //look if that user already exists
    //logger.info("createUser %s %s %s %s %s %s ", regEmail, domain, serverURL, secureSSL, signature, authType);

    async.waterfall(
        [
            function(callback) {
                var defaults = {
                    username: regEmail,
                    orgdomain: domain,
                    passcode: '',
                    passcodeupdate: new Date(),
                    orgemail: regEmail,
                    orguser: '',
                    orgpassword: '',
                    serverurl: (org_obj.authType !== "0") ? org_obj.serverurl : serverURL,
                    securessl: (org_obj.authType !== "0") ? org_obj.serverssl : secureSSL.toString(),
                    signature: (org_obj.authType !== "0") ? org_obj.signature : signature,
                    authtype: (org_obj.authType !== "0") ? org_obj.authtype : authType.toString(),
                    isactive: 1,
                };
                Common.db.User.findOrCreate({
                    where: {
                        email: regEmail
                    },
                    defaults: defaults
                }).complete(function(err, results) {
                    if (!!err) {
                        var msg = "Error while createUser while selecting user: " + err;
                        logger.error(msg,err);
                        callback(msg);
                    } else {
                        callback(null, results);
                    }
                });
            },
            function(results, callback) {
                if (results[1]) {
                    postNewUserProcedure(regEmail, domain, logger, function(err) {
                        callback(null, results);
                    });
                } else {
                    callback(null, results);
                }
            },
            function(results, callback) {
                //logger.info("Found user: " + results[0].username);
                userModule.createUserApplicationNotif(regEmail, domain);

                var user_obj = results[0].dataValues;
                user_obj.email = regEmail;
                user_obj.firstname = results[0].firstname;
                user_obj.lastname = results[0].lastname;
                user_obj.username = results[0].username != null ? results[0].username : '';
                user_obj.passcode = results[0].passcode;
                user_obj.passcodeupdate = results[0].passcodeupdate;
                user_obj.passcodetypechange = results[0].passcodetypechange;
                user_obj.orgemail = results[0].orgemail != null ? results[0].orgemail : '';
                user_obj.orguser = results[0].orguser != null ? results[0].orguser : '';
                user_obj.orgpassword = Common.dec(results[0].orgpassword);
                //If authType !=0 that means that we
                //take exchange params from orgs table
                user_obj.serverurl = results[0].serverurl != null ? results[0].serverurl : '';
                user_obj.serverssl = results[0].securessl != null ? results[0].securessl : '1';
                user_obj.signature = results[0].signature != null ? results[0].signature : '';
                user_obj.authtype = results[0].authtype != null ? results[0].authtype : '0';
                user_obj.isactive = results[0].isactive != null ? results[0].isactive : 0;
                user_obj.isadmin = results[0].isadmin != null ? results[0].isadmin : 0;
                user_obj.encrypted = results[0].encrypted != null ? results[0].encrypted : 0;
                user_obj.lang = results[0].language ? (results[0].language || "en") : "en";
                user_obj.countrylang = results[0].countrylang ? (results[0].countrylang || 'US') : 'US';
                user_obj.localevar = results[0].localevar ? (results[0].localevar || '') : '';
                user_obj.dcname = results[0].dcname;
                user_obj.dcurl = results[0].dcurl;
                user_obj.orgdomain = results[0].orgdomain;
                user_obj.docker_image = results[0].docker_image;
                user_obj.recording = results[0].recording;
                //logger.info("Loaded user %s %s %s %s %s %s %s %s", lpasscode, lorgEmail, lorgUser, lorgPassword, lserverURL, lsecureSSL, lsignature, lauthType);
                callback(null, user_obj);
            },
            function(user_obj, callback) {
                userModule.createUserApplicationNotif(regEmail, domain);
                callback(null, user_obj);
            }
        ],
        function(err, res) {
            if (err) {
                logger.error("createUser failed with err: " + err);
            }
            callback(err, res);
        }
    );
}

function updateUserAccount(registrationEmail, orgEmail, authType, serverURL, domain,
    orgUser, orgPassword, secureSSL, signature, fromDevice, updateOtherDevices, updateMainDevice, callback) {
    // check for username field in db to avoid overwrite the username with email
    // after setup exchange
    Common.db.User.findAll({
        attributes: ['email', 'username', 'signature'],
        where: {
            email: registrationEmail
        },
    }).complete(function(err, results) {

        if (!!err) {
            callback("Internal error: " + err);
            return;
        }

        if (!results || results == "") {
            callback("Cannot find user by email " + registrationEmail);
        }

        var dbUserName = (results[0].username != null && results[0].username.length > 0) ? results[0].username : registrationEmail;
        var updatedSignature = signature;
        if (!signature || signature == undefined || signature == "") {
            //TODO add default nubo signature!!!
            updatedSignature = (results[0].signature != null && results[0].signature.length > 0) ? results[0].signature : Common.defaultSignature;
        }

        Common.db.User.update({
            authtype: authType,
            serverurl: serverURL,
            orgemail: orgEmail,
            orguser: orgUser,
            orgpassword: Common.enc(orgPassword),
            securessl: secureSSL,
            signature: updatedSignature,
            username: dbUserName,
            exchange_domain: domain
        }, {
            where: {
                email: registrationEmail
            }
        }).then(function() {
            if (authType == 1) {
                if (orgUser && orgUser.indexOf('\\') < 0 && orgUser.indexOf('@') < 0) {
                    if (Common.EWSOldDomain === true)
                        orgUser = domain + "\\" + orgUser;
                    else
                        orgUser = orgUser + "@"  + domain;
                }
            } else if (authType == 2) {
                authType = '1';
                serverURL = 'https://m.google.com';
                orgUser = registrationEmail;
            }

            var setAccountValues = {};
            if (authType != 0) {
                var parsedURL = url.parse(serverURL);
                setAccountValues = {
                    'accountType': authType,
                    'email': registrationEmail,
                    'orgEmail': orgEmail,
                    'username': orgUser,
                    'password': orgPassword,
                    'serverName': parsedURL.hostname,
                    'domain': domain,
                    'serverPort': parsedURL.port == null ? '443' : parsedURL.port,
                    'secureSSL': secureSSL,
                    'signature': updatedSignature
                };

            }

            addSettingsToDevices(registrationEmail, fromDevice, 'setAccount', setAccountValues, updateOtherDevices, updateMainDevice, function(err) {
                if (err) {
                    logger.error("Error: " + err);
                    callback("x:" + err);
                    // return with error
                    return;
                }
                callback(null);
                // return withno error
            });

        }).catch(function(err) {
            var msg = "Error while setUserDetails: " + err;
            logger.info(msg);
            callback(msg);
            // return error
            return;
        });
    });

}

function AddAppStoreSettingsToNewDevice(regEmail, deviceid,cb) {
    if (Common.appstore && Common.appstore.enable === true) {

        userModule.getUserDomain(regEmail, function (orgDomainFromDB) {
            let maindomain;
            if (orgDomainFromDB)
                maindomain = orgDomainFromDB;
            else
                maindomain = email.substr(email.indexOf('@') + 1);

            let repo_address = Common.appstore.url + "/" +maindomain+"/repo";
            let values = {
                repo_address: repo_address
            };
            logger.info("AddAppStoreSettingsToNewDevice. repo_address: "+repo_address);
            addSettingsToSpecificDevice(regEmail, deviceid, "appstore", values, "appstore.json", () => {
                cb();
            });
        });
    } else {
        cb();
    }
}


function AddSettingToNewDevice(regEmail, deviceid,cb) {
    async.series([
        (cb) => {
            AddEmailSettingsToNewDevice(regEmail, deviceid,cb);
        },
        (cb) => {
            AddTelephonySettingsToNewDevice(regEmail, deviceid,cb);
        },
        (cb) => {
            AddAppStoreSettingsToNewDevice(regEmail, deviceid,cb);
        }
    ],(err) => {
        if (cb) {
            cb(err);
        }
    });
}

function AddEmailSettingsToNewDevice(regEmail,deviceid,cb) {

    Common.db.User.findAll({
        where : {
            email: regEmail
        },
    }).complete(function(err, results) {
      if (!!err) {
        logger.error("AddEmailSettingsToNewDevice. Error getting User.", err);
        cb();
        return;
      } else if (!results || results == "" || results.length === 0) {
        logger.info("AddEmailSettingsToNewDevice. Not found user");
        cb();
        return;
      }
      let user = results[0];
      let authType = Number(user.authtype);
      if (isNaN(authType) || authType == 0 || !user.serverurl ) {
          cb();
          return;
      }
      let orgUser = user.orguser;
      let domain = user.exchange_domain;
      if (authType == 1) {
        if (orgUser && orgUser.indexOf('\\') < 0 && orgUser.indexOf('@') < 0) {
            if (Common.EWSOldDomain === true)
                orgUser = domain + "\\" + orgUser;
            else
                orgUser = orgUser + "@"  + domain;
        }
      }
      let orgPassword = Common.dec(user.orgpassword);
      var setAccountValues = {};
        if (authType != 0) {
            var parsedURL = url.parse(user.serverurl);
            setAccountValues = {
                'accountType': authType,
                'email': regEmail,
                'orgEmail': user.orgemail,
                'username': orgUser,
                'password': orgPassword,
                'serverName': parsedURL.hostname,
                'domain': domain,
                'serverPort': parsedURL.port == null ? '443' : parsedURL.port,
                'secureSSL': user.securessl,
                'signature': user.signature
            };

        }

      logger.info(`AddEmailSettingsToNewDevice. username: ${orgUser}`);
      addSettingsToSpecificDevice(regEmail,deviceid,"setAccount",setAccountValues,"startup.json",() => {
        cb();
      });
    });
}
function AddTelephonySettingsToNewDevice(regEmail, deviceid,cb) {
    Common.db.UserDevices.findAll({
        where : {
            active: 1,
            sip_username: {
                [Op.ne]: null
            },
            sip_domain: {
                [Op.ne]: null
            },
            email: regEmail,
            imei: deviceid
        },
    }).complete(function(err, results) {
      if (!!err) {
        logger.error("AddTelephonySettingsToNewDevice. Error getting UserDevice.", err);
        cb();
        return;
      } else if (!results || results == "" || results.length === 0) {
        //logger.info("AddTelephonySettingsToNewDevice. Not found active sip account for device");
        cb();
        return;
      }
      let device = results[0];
      if (!device.sip_username || device.sip_username.length === 0 || !device.sip_domain || device.sip_domain.length === 0) {
          cb();
          return;
      }
      let values = {
        assigned_phone_number : device.assigned_phone_number,
        sip_username: device.sip_username,
        sip_domain: device.sip_domain,
        sip_password: device.sip_password,
        sip_port: device.sip_port,
        sip_protocol: device.sip_protocol,
        sip_proxy: device.sip_proxy,
        region_code: device.region_code,
        messaging_server: device.messaging_server,
        messaging_token_type: device.messaging_token_type
      };
      logger.info("AddTelephonySettingsToNewDevice");
      addSettingsToSpecificDevice(regEmail,deviceid,"telephony",values,"telephony.json",() => {
        cb();
      });

    });
}

function updateDeviceTelephonySettingsImp(regEmail, deviceid, values) {
    let promise = new Promise((resolve,reject) => {
        logger.info("updateDeviceTelephonySettings. regEmail: "+regEmail+", deviceid: "+deviceid);
        let user,device;
        async.series([
            function(cb) {
                //check if user exsists
                createOrReturnUserAndDomain(regEmail,logger,(err,userObj) => {
                    user = userObj;
                    cb(err);
                });
            },
            function(cb) {
                Common.db.UserDevices.findOne({
                    where: {
                        imei: deviceid,
                        email: regEmail
                    }
                }).then(fDevice => {
                    device = fDevice;
                    cb();
                }).catch(err => {
                    logger.info("Error finding UserDevice: "+ err);
                    cb();
                });
            },
            function(cb) {
                if (device) {
                    cb();
                    return;
                }
                Common.db.UserDevices.create({
                    imei: deviceid,
                    email: regEmail,
                    active: 1,
                    maindomain: user.domain,
                    inserttime: new Date()
                }).then(fDevice => {
                    device = fDevice;
                }).catch(err => {
                    logger.info("Error creating UserDevice: "+ err);
                    cb(err);
                });
            },
            /*function(cb) {
                //create user device if not exists
                Common.db.UserDevices.findOrCreate({
                    where: {
                        imei: deviceid,
                        email: regEmail
                    },
                    defaults: {
                        imei: deviceid,
                        email: regEmail,
                        active: 1,
                        maindomain: user.domain,
                        inserttime: new Date()
                    }
                }).then(function (result) {
                    let created = result[1];
                    if (created)
                        logger.info("user_devices created: device " + deviceid + " added to user: " + regEmail);
                    cb();
                }).catch(function (err) {
                    logger.info("Error creating UserDevice: "+ err);
                    cb();
                });
            },*/
            function(callback) {
                // update database
                logger.info(`Saving device...`);
                for (var prop in values) {
                    if (Object.prototype.hasOwnProperty.call(values, prop)) {
                        device[prop] = values[prop];
                    }
                }
                device.save().then(function() {
                    logger.info(`Updateded User device ${regEmail}:${deviceid}, values: ${JSON.stringify(values,null,2)}`);
                    callback();
                    return;
                }).catch(function(err) {
                    logger.info("Unable to update database with telephony settings: "+err);
                    callback(err);
                    return;
                });
            },
            function(callback) {
                // update the settings file with the new telephony settings
                addSettingsToSpecificDevice(regEmail,deviceid,"telephony",values,"telephony.json",(err) => {
                    callback();
                });
            },
            function(callback) {
                // notify sipproxy to add/change device
                let message  = "add,"+ regEmail +","+deviceid;
                Common.redisClient.publish("sipChannel", message,callback);
            },
            function(callback) {
                if (Common.messagesServer && Common.createRedisMessagesClient) {
                    // Update messages server with the new extension
                    let params = {
                        "userID" : values.sip_username,
                        "newUser": "true",
                        "password": values.sip_password
                    }
                    let redisMessagesClient = Common.createRedisMessagesClient();
                    redisMessagesClient.hmset('user_'+values.sip_username, params, (err) => {
                        if (err) {
                            logger.info("redisMessagesClient error",err);
                        }
                        redisMessagesClient.quit();
                        callback(err);
                    });
                } else {
                    callback();
                }
            }
        ],function(err){
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
    return promise;

}

function updateDeviceTelephonySettings(regEmail, deviceid, assigned_phone_number, sip_username,
        sip_domain, sip_password, sip_port, sip_protocol, sip_proxy, region_code,
        messaging_server, messaging_token_type,
        callback) {
    let values = {
        assigned_phone_number : assigned_phone_number,
        sip_username: sip_username,
        sip_domain: sip_domain,
        sip_password: sip_password,
        sip_port: sip_port,
        sip_protocol: sip_protocol,
        sip_proxy: sip_proxy,
        region_code: region_code,
        messaging_server: messaging_server,
        messaging_token_type: messaging_token_type
    };
    updateDeviceTelephonySettingsImp(regEmail,deviceid,values).then(() => {
        callback();
    }).catch(err => {
        callback(err);
    });
}


/**
 *
 * @param {*} email
 * @param {*} deviceId
 */
async function resizeUserData(email, deviceId,inc_storage) {
    let dockerPlatform = (Common.platformType == "docker");
    if (!dockerPlatform || !Common.isMobile()) {
        // currently image resize avaialble onle in docker mobile
        return;
    }
    const LockAsync = require('./lock-async');
    var userFolder = commonUtils.buildPath(Common.nfshomefolder, userModule.getUserDeviceDataFolder(email, deviceId));
    let pathToDataImg = commonUtils.buildPath(userFolder,"data.img");
    let lock = new LockAsync(`lock_mount_${pathToDataImg}`);
    await lock.acquire();
    try {
        // read file system information on image
        let tunefsRes = await commonUtils.execCmd('tune2fs',["-l",pathToDataImg]);
        let tunefsObj = {};
        const lines = tunefsRes.stdout.split("\n");
        for (const line of lines) {
            let ind = line.indexOf(":");
            let key = line.substring(0, ind).toLowerCase().trim();
            let value = line.substring(ind + 1).trim();
            if (key)
                tunefsObj[key] = value;

        }
        //logger.info(`resizeUserData. Image tune2fs: ${JSON.stringify(tunefsObj,null,2)}`);
        let blockCount = tunefsObj["block count"];
        let freeBlocks = tunefsObj["free blocks"];
        let blockSize = tunefsObj["block size"];
        let free = (freeBlocks / blockCount);
        logger.info(`resizeUserData. Image free space: ${(free * 100).toFixed(0)}%,  ${(freeBlocks * blockSize / 1024 / 1024).toFixed(0)} MB. inc_storage: ${inc_storage}`);
        //

        if (free < 0.5 || inc_storage) {
            let newBlock = Math.ceil(blockCount * 2);
            logger.info(`resizeUserData. Resize image to ${(newBlock * blockSize / 1024 / 1024).toFixed(0)} MB (${newBlock}) blocks`);
            let checkRes = await commonUtils.execCmd('e2fsck',["-fy",pathToDataImg]);
            let resizeRes = await commonUtils.execCmd('resize2fs',[pathToDataImg,newBlock]);
            logger.info(`resizeUserData. Resize finished!`);
        }

    } finally {
        lock.release();
    }
}

/**
 * Mount user data.ing into temporary location
 * return folderParams object with refereneces to folders
 * @param {*} email
 * @param {*} deviceId
 * @param {*} dockerPlatform
 * @return {*} folderParams
 */
 async function mountUserData(email, deviceId,dockerPlatform) {
    var userFolder = commonUtils.buildPath(Common.nfshomefolder, userModule.getUserDeviceDataFolder(email, deviceId));
    let folderParams = {
        userFolder
    };

    if (dockerPlatform) {
        let pathToDataImg = commonUtils.buildPath(userFolder,"data.img");
        let dataTempFolder = commonUtils.buildPath(userFolder,"mnt");
        // check if mount exists
        let mountExists = false;
        try {
            let testDir = commonUtils.buildPath(dataTempFolder,"data");
            const stats = await fsp.stat(testDir);
            mountExists = stats.isDirectory();
        } catch (e) {
            //logger.error(`mountUserData fsp.stat error`,e);
        }
        if (!mountExists) {
            logger.info(`Mounting user data img: ${pathToDataImg}, mount: ${dataTempFolder}`);
            const LockAsync = require('./lock-async');
            folderParams.mountLock = new LockAsync(`lock_mount_${pathToDataImg}`);
            await folderParams.mountLock.acquire();
            try {
                await fsp.mkdir(dataTempFolder,{recursive: true});
                await commonUtils.execCmd('mount',[pathToDataImg,dataTempFolder]);
                folderParams.mounted = true;
            } catch (err) {
                try {
                    logger.info(`Mount error (${err}), release lock and throw error`);
                    await folderParams.mountLock.release();
                } catch (e) {
                    logger(`mountUserData. release lock error :${e}`);
                }
                throw err;
            }
        } else {
            logger.info(`User data image already mounted. img: ${pathToDataImg} mount: ${dataTempFolder}`);
        }
        folderParams.dataTempFolder = dataTempFolder;
        folderParams.pathToDataImg = pathToDataImg;
    }
    return folderParams;
}

/**
 * Unmount the data temp folder if its mounted
 * @param {*} folderParams
 */
async function unMountUserData(folderParams) {
    if (folderParams.mounted) {
        logger.info(`Unmounting user data. mount: ${folderParams.dataTempFolder}`);
        await commonUtils.execCmd('umount',[folderParams.dataTempFolder]);
        folderParams.mounted = false;
        if (folderParams.mountLock) {
            await folderParams.mountLock.release();
            folderParams.mountLock = null
        }
    }
}

function addSettingsToSpecificDevice(regEmail, deviceid, paramName, paramValues, settingsFileName, callback) {
    let settings;
    if (typeof settingsFileName === "function") {
        callback = settingsFileName;
        settingsFileName = "startup.json";
    }
    if (!settingsFileName) {
        settingsFileName = "startup.json";
    }
    let dockerPlatform = (Common.platformType == "docker");
    let folderParams;

    async.series([
        function(callback) {
            mountUserData(regEmail,deviceid,dockerPlatform).then(folderParamsObj => {
                folderParams = folderParamsObj;
                callback();
            }).catch(err => {
                logger.error(`mountUserData error: ${err}`,err);
                callback(err);
            });
        },
        function(callback) {
            // first load existing settings file if exists
            loadSettingsUpdateFile(regEmail, deviceid, settingsFileName,  dockerPlatform,folderParams, function(err, oldSettings) {
                if (err) {
                    //logger.info("Old settings file does not exists or error: "+err);
                    settings = {};
                } else {
                    settings = oldSettings;
                }
                callback();
            });
        },
        function(callback) {
            // update the settings file with the new parameter
            settings[paramName] = paramValues;
            saveSettingsUpdateFile(settings, regEmail, deviceid, settingsFileName, dockerPlatform,folderParams, function (err) {
                if (err) {
                    //logger.error("Error saveSettingsUpdateFile : " + err);
                    callback(err);
                    return;
                }
                logger.info("Updated settings for " + regEmail + ", " + deviceid);
                callback();
            });
        }
    ],function(err){
        if (folderParams && folderParams.mounted) {
            unMountUserData(folderParams).then(() => {
                callback(err);
            }).catch(errUn => {
                logger.error(`Error unmounting temp data folder: ${errUn}`,errUn);
                callback(err);
            });
        } else {
            callback(err);
        }
    });
}


function addSettingsToDevices(regEmail, deviceid, paramName, paramValues, updateOtherDevices, updateMainDevice, callback) {
    var foundDevices = {};
    logger.info("addSettingsToDevices. deviceid: " + deviceid + ", updateOtherDevices: " + updateOtherDevices + ", updateMainDevice: " + updateMainDevice);

    Common.db.Activation.findAll({
        attributes: ['deviceid', 'status'],
        where: {
            email: regEmail
        },
    }).complete(function(err, results) {

        if (!!err) {
            if (callback != null)
                callback("Internal error: " + err);
            return;
        }

        if (!results || results == "") {
            if (callback != null)
                callback(null);
            return;
        }

        results.forEach(function(row) {
            var newDeviceID = row.deviceid;
            if (newDeviceID == null || newDeviceID == "")
                return;
            // check if it this device id created the event and id we do not need to re-set it
            if (!updateMainDevice && newDeviceID == deviceid) {
                //logger.info("Not update main device: " + newDeviceID);
                return;
            }
            // check if we already setup this device (duplicate activation)
            if (foundDevices[newDeviceID] != null) {
                //logger.info("Device already updated: " + newDeviceID);
                return;
            }
            if (newDeviceID == deviceid || updateOtherDevices) { // device not processed yet
                foundDevices[newDeviceID] = newDeviceID;
                //                loadSettingsUpdateFile(regEmail, newDeviceID, function(err, settings) {
                //                    settings[paramName] = paramValues;
                var settings = {};
                settings[paramName] = paramValues;
                let dockerPlatform = (Common.platformType == "docker");
                mountUserData(regEmail,deviceid,dockerPlatform).then(folderParams => {
                    saveSettingsUpdateFile(settings, regEmail, newDeviceID, null, dockerPlatform,folderParams, function(err) {
                        if (err) {
                            logger.error("Error saveSettingsUpdateFile : " + err);
                        } else {
                            logger.info("Updated settings for " + regEmail + ", " + newDeviceID);
                        }
                        unMountUserData(folderParams).then(() => {

                        }).catch(err => {
                            logger.info(`unMountUserData error: ${err}`,err);
                        })
                    });
                }).catch(err => {
                    logger.error(`mountUserData error: ${err}`,err);
                    return;
                });



                // saveSettingsUpdateFile
                //                }); // loadSettingsUpdateFile
            }
        });
        if (callback != null)
            callback(null);
    });
}

function saveSettingsUpdateFile(settings, userName, deviceID, settingsFileName, dockerPlatform, folderParams, callback) {
    if (typeof settingsFileName === "function") {
        callback = settingsFileName;
        settingsFileName = "startup.json";
    }
    if (!settingsFileName) {
        settingsFileName = "startup.json";
    }
    var str = JSON.stringify(settings, null, 4);
    var fs = Common.fs;

    var folderName;
    let uid;
    if (dockerPlatform) {
        folderName = commonUtils.buildPath(folderParams.dataTempFolder,"data");
        uid = 1000;
    } else {
        folderName = commonUtils.buildPath(folderParams.userFolder,"user");
        uid = 101000;
    }
    var settingsFolder = commonUtils.buildPath(folderName, Common.settingsfolder);
    var fileName = commonUtils.buildPath(settingsFolder,settingsFileName);
    logger.info(`saveSettingsUpdateFile. fileName: ${fileName}`);
    async.series(
        [
            function(callback) {
                fs.stat(folderName, function(err, stat) {
                    callback(err);
                });
            },
            function(callback) {
                fs.mkdir(settingsFolder, { recursive: true }, function(err) {
                    if (err && err.code == 'EEXIST') {
                        callback(null);
                    } else {
                        callback(err);
                    }
                });
            },
            function(callback) {
                var opts = {
                    mode: "751",
                    owner: {
                        uid: uid,
                        gid: uid
                    }
                };
                changeModeOwner(settingsFolder, opts, callback);
            },
            function(callback) {
                fs.writeFile(fileName, str, callback);
            },
            function(callback) {
                var opts = {
                    mode: "640",
                    owner: {
                        uid: uid,
                        gid: uid
                    }
                };
                changeModeOwner(fileName, opts, callback);
            }
        ],
        function(err) {
            if (err) {
                logger.error("saveSettingsUpdateFile failed with err:" + JSON.stringify(err));
            } else {
                logger.info(`saveSettingsUpdateFile finished`);
            }
            callback(err);
        }
    );
}



function createUserFolders(email, deviceid, deviceType, overwrite, time, hrTime, callback, demoUser, tempUserDataFlag, sessTrack, hideNuboAppPackageName) {

    var userFolder, userFolderSd, storageFolder, dataFolder, domainNewUserFile, newUserFile;


    logger.info(`createUserFolders. deviceType: ${deviceType}`);
    async.waterfall(
        [
            function(callback) {
                require('./nfs.js')({
                        nfs_idx: Common.nfsId
                    },
                    function(err, nfsobj) {
                        if (err) {
                            var msg = "cannot create nfs obect err: " + err;
                            callback(msg);
                            return;
                        }

                        userFolder = commonUtils.buildPath(nfsobj.params.nfs_path, userModule.getUserHomeFolder(email));
                        userFolderSd = commonUtils.buildPath((nfsobj.params.nfs_path_slow || nfsobj.params.nfs_path), userModule.getUserHomeFolder(email));
                        dataFolder = commonUtils.buildPath(userFolder, deviceid, '/');
                        storageFolder = userFolderSd + 'storage/media/Download';
                        let domainFolder = userModule.getDomainFolder(email);
                        if (deviceType != "Desktop") {
                            if (Common.platformType == "docker") {
                                domainNewUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, domainFolder,NEW_USER_DATA_IMG);
                                newUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, NEW_USER_DATA_IMG);
                            } else {
                                domainNewUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, domainFolder,NEW_USER_TAR);
                                newUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, NEW_USER_TAR);
                            }
                        } else {
                            domainNewUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, domainFolder,LINUX_NEW_USER_TAR);
                            newUserFile = commonUtils.buildPath(nfsobj.params.nfs_path, LINUX_NEW_USER_TAR);
                        }
                        callback(null);
                    }
                );
            },
            function(callback) {
                Common.mkdirpCB(userFolder, function(err) {
                    if (err) {
                        var msg = "Unable to create user folder " + userFolder + " : " + err;
                        logger.info(msg);
                    }
                    callback(err);
                });
            },
            function(callback) {
                if (deviceType == "Desktop") {
                    callback(null);
                    return;
                }
                Common.mkdirpCB(storageFolder, function(err) {
                    if (err) {
                        var msg = "Unable to create user folder " + storageFolder + ": " + err;
                        logger.info(msg);
                        callback(err);
                    } else {
                        var chownParams = ["1023.1023", "-R", userFolderSd + "storage/media"];
                        execFile(Common.globals.CHOWN, chownParams, function(error, stdout, stderr) {
                            callback(null);
                        });
                    }
                });
            },
            function(callback) {
                if (deviceType == "Desktop") {
                    callback(null);
                    return;
                }
                Common.fs.chmod(storageFolder, '777', function(err) {
                    callback(err);
                });
            },
            function(callback) {
                Common.fs.exists(dataFolder, function(exist) {
                    callback(null, exist);
                });
            },
            function(exist, callback) {
                if (exist) {
                    callback(null, exist);
                } else {
                    Common.mkdirpCB(dataFolder, '0777', function(err) {
                        callback(err, exist);
                    });
                }
            },
            function(exists, callback) {
                // find best new_user file
                Common.fs.exists(domainNewUserFile, function(fomainFileExist) {
                    if (fomainFileExist) {
                        logger.info(`Found domain new user file at: ${domainNewUserFile}`);
                        newUserFile = domainNewUserFile;
                    }
                    callback(null,exists);
                });
            },
            function(exists, callback) {
                if (exists && !overwrite) {
                    callback(null, exists);
                    return;
                }

                if (demoUser) {
                    callback("unsupported demo state");
                    return
                }


                if (newUserFile.endsWith(".img")) {
                    const imgFile = commonUtils.buildPath(dataFolder,"data.img");
                    fs.copyFile(newUserFile,imgFile,function(err) {
                        if (err) {
                            logger.error(`Copy img file error: ${err}`,err);
                            callback(err);
                        } else {
                            callback(null, exists);
                        }
                    });
                } else {
                var tarParams = ["xvzf", newUserFile, "-C", dataFolder];
                    execFile(Common.globals.TAR, tarParams, function(err, stdout, stderr) {
                        if (err) {
                            logger.error("createUserFolders: " + err);
                            logger.error("createUserFolders: " + stdout);
                            logger.error("createUserFolders: " + stderr);
                            callback("failed extracting " + Common.nfshomefolder + newUserFile);
                            return;
                        }
                        callback(null, exists);
                    });
                }
            },
            function(exists, callback) {
                if (exists && !overwrite) {
                    callback(null, exists);
                    return;
                }

                if (demoUser) {
                    callback("unsupported demo state");
                    return
                }

                var chownParams = ["1023.1023", "-R", userFolderSd + 'storage'];
                execFile(Common.globals.CHOWN, chownParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.error("createUserFolders: " + err);
                        logger.error("createUserFolders: " + stdout);
                        logger.error("createUserFolders: " + stderr);
                        callback("failed chown " + userFolderSd + 'storage');
                        return;
                    }
                    callback(null, exists);
                });
            },
            function(exists, callback) {
                if (exists && !overwrite) {
                    callback(null);
                    return;
                }

                if (demoUser) {
                    callback("unsupported demo state");
                    return
                }

                enableNewDeviceApps(email, deviceid, time, hrTime, callback);
            },
            function(cb) {
                // configure email settings if needed
                AddEmailSettingsToNewDevice(email, deviceid,cb);
            },
            function(cb) {
                // configure telephony settings if needed
                AddTelephonySettingsToNewDevice(email, deviceid,cb);
            },
            function(cb) {
                // configure appstore settings if needed
                AddAppStoreSettingsToNewDevice(email, deviceid,cb);

            },
            function(cb) {
                //logger.info("Create sessTrack if needed... tempUserDataFlag:" + tempUserDataFlag + ", sessTrack: " + sessTrack + ", hideNuboAppPackageName:" + hideNuboAppPackageName);
                if (tempUserDataFlag && sessTrack && hideNuboAppPackageName && Common.hideNuboAppPackageUIDs) {
                    var uid = Common.hideNuboAppPackageUIDs[hideNuboAppPackageName];
                    logger.info("uid: " + uid);
                    if (!uid || uid <= 0) {
                        cb(null);
                        return;
                    }
                    var appFolder = dataFolder + hideNuboAppPackageName + "/files/";
                    logger.info("Writing sessTrack file to folder " + appFolder + " with uid " + uid);
                    async.series([
                        function(cb) {
                            Common.mkdirpCB(appFolder, function(err) {
                                cb(err);
                            });
                        },
                        function(cb) {
                            Common.fs.chown(appFolder, uid, uid, function(err) {
                                cb(err);
                            });
                        },
                        function(cb) {
                            Common.fs.writeFile(appFolder + 'sessTrack', sessTrack, (err) => {
                                // throws an error, you could also catch it here
                                if (err) {
                                    logger.info("Error saving sessTrack", err);
                                } else {
                                    // success case, the file was saved
                                    console.log('sessTrack saved!');
                                }

                                cb(null);
                            });
                        },
                        function(cb) {
                            Common.fs.chown(appFolder + 'sessTrack', uid, uid, function(err) {
                                cb(err);
                            });
                        },
                    ], function(err) {
                        if (err) {
                            logger.info("Error saving or creting sessTrack", err);
                        }
                        cb(null);
                    });

                } else {
                    cb(null);
                }
            }
        ],
        function(err) {
            if (err) {
                logger.error("createUserFolders: " + err);
                callback("createUserFolders failed");
                return;
            }

            logger.info('createUserFolders done');
            callback(null);
        }
    );
}

function getAppListForUser(email, maindomain,callback){

        // Iterate over all user apps

        Common.db.UserApps.findAll({
            attributes: ['packagename'],
            where: {
                email: email,
                maindomain: maindomain
            },
        }).complete(function(err, results) {

            if (!!err) {
                msg = "Internal error: ";
                logger.info(msg,err);
                callback(msg);
                return;;
            }

            let res = [];
            if (!results || results == "") {
                logger.info("No installed packages found for user.");
                callback(null,res);
                return;
            }

            results.forEach(function(row) {
                let packageName = row.packagename;
                if (packageName && packageName != "") {
                    res.push(packageName);
                }
            });
            callback(null,res);

        });


}

// Insert all uer's apps as "to be installed" in device_apps
function enableNewDeviceApps(email, deviceId, time, hrTime, callback) {
    var maindomain;
    userModule.getUserDomain(email, function(orgDomainFromDB) {
        if (orgDomainFromDB)
            maindomain = orgDomainFromDB;
        else
            maindomain = email.substr(email.indexOf('@') + 1);


        Common.db.UserApps.findAll({
            attributes: ['packagename'],
            where: {
                email: email,
                maindomain: maindomain,
                auto_install: 1
            },
        }).then(function(results) {


            if (!results || results == "") {
                logger.info("No installed packages found for user.");
                callback(null);
                return;
            }

            var addAppModule = require('./ControlPanel/addAppsToProfiles.js');
            var insertToDeviceApps = addAppModule.insertToDeviceApps;
            var TO_BE_INSTALLED = addAppModule.TO_BE_INSTALLED;

            async.each(results, function(result, callback) {
                var packageName = result.packagename;
                // Insert app to device_apps
                 // Iterate over all user apps
                Common.db.Apps.findOne({
                    attributes: ['filename'],
                    where: {
                        packagename: packageName,
                        maindomain: maindomain,
                    },
                }).then(app => {
                    insertToDeviceApps(email, deviceId, packageName, app.filename, maindomain, TO_BE_INSTALLED, time, hrTime, function(err) {
                        callback(err);
                    });
                }).catch (err => {
                    callback(err)
                })

            }, function(err) {
                callback(err);
            });
        }).catch(err => {
            msg = "Internal error: ";
            logger.info(msg);
            callback(msg);
        });
    });

}

function validateUserFolders(UserName, deviceID, deviceType, keys, callback) {
    var folder, folderSd;
    async.series([
        // check main folder
        function(callback) {
            require('./nfs.js')({
                    nfs_idx: Common.nfsId
                },
                function(err, nfsobj) {
                    if (err) {
                        logger.error("validateUserFolders: cannot create nfs object err: " + err);
                        callback(err);
                        return;
                    }

                    folder = commonUtils.buildPath(nfsobj.params.nfs_path, userModule.getUserDeviceDataFolder(UserName, deviceID));
                    folderSd = commonUtils.buildPath((nfsobj.params.nfs_path_slow || nfsobj.params.nfs_path), userModule.getUserStorageFolder(UserName), "/media");
                    callback(null);
                }
            );
        },
        function(callback) {
            Common.fs.exists(folder, function(exists) {
                if (!exists) {
                    var msg = "Folder " + folder + " doesn't exists!";
                    logger.info(msg);
                    callback(msg);
                } else
                    callback(null);
            });
        },
        // check system folder
        function(callback) {
            var chfolder = folder + '/user';
            if (deviceType == "Desktop") {
                chfolder = folder;
            } else if (Common.platformType == "docker") {
                chfolder = folder + '/data.img';
            }
            Common.fs.exists(chfolder, function(exists) {
                if (!exists) {
                    var msg = "Folder " + chfolder + " doesn't exists!";
                    logger.info(msg);
                    callback(msg);
                } else
                    callback(null);
            });
        },
        // check storage folder
        function(callback) {
            if (deviceType == "Desktop") {
                callback(null);
                return;
            }
            Common.fs.stat(folderSd, function(err, stat) {
                if (err) {
                    var msg = "Folder " + folderSd + " doesn't exists!";
                    logger.info(msg);
                    callback(msg);
                } else
                    callback(null);
            });
            // Common.fs.exists
        }

    ], function(err, results) {
        callback(err);
    });
}

// function encryptUserFolders(UserName, deviceID, keys, callback) {
//     async.parallel([
//         function(callback) {
//             encryptUserDeviceDataFolders(UserName, deviceID, keys, callback);
//         },
//         function(callback) {
//             encryptUserStorageFolders(UserName, deviceID, keys, callback);
//         }
//     ], function(err) {
//         console.log("Finish encryptUserFolders with err:" + err);
//         callback(err);
//     });
// }

// function encryptUserDeviceDataFolders(UserName, deviceID, keys, callback) {
//     var dev_dir = Common.nfshomefolder + userModule.getUserDeviceDataFolder(UserName, deviceID);
//     var dev_dir_nonenc = dev_dir.substring(0, dev_dir.length - 1) + "_nonencrypted";
//     async.series([
//         function(callback) {
//             Common.fs.exists(dev_dir_nonenc, function(exists) {
//                 if (!exists) {
//                     callback(null);
//                 } else {
//                     var msg = "oops... directory " + dev_dir_nonenc + " already exist";
//                     logger.info(msg);
//                     callback(msg);
//                 }
//             });
//         },
//         function(callback) {
//             encryptFolderLocked(dev_dir, dev_dir_nonenc, keys, callback);
//         }
//     ], function(err, results) {
//         console.log("Finish encryptUserDeviceDataFolders with err:" + err);
//         callback(err);
//     });
// }

// function encryptFolderLocked(src, tmp, keys, callback) {
//     async.series([
//         function(callback) {
//             Common.fs.rename(src, tmp, callback);
//         },
//         function(callback) {
//             var cmd = "mkdir -m 0771 " + src + " && chown 1000.1000 " + src;
//             //                logger.info("cmd: " + cmd);
//             exec(cmd, function(error, stdout, stderr) {
//                 if (error) {
//                     callback("dir already exist");
//                 }
//                 callback(null);
//             });
//         },
//         function(callback) {
//             var cmd = "";
//             // create new session for storage of keys
//             cmd = "keyctl new_session \\\n";
//             // load password
//             cmd = cmd + " && keyctl add user mykey " + keys.ecryptfs_password + " @s \\\n";
//             // load key
//             cmd = cmd + " && keyctl add encrypted beefbeefbeefbeef \"load " + keys.ecryptfs_key + "\" @s \\\n";
//             cmd = cmd + " && mkdir -p " + src + " \\\n" + " && mount -i -t ecryptfs -o ecryptfs_sig=beefbeefbeefbeef,ecryptfs_cipher=aes,ecryptfs_key_bytes=32" + " " + src + " " + src + " \\\n";
//             // clean session, remove all loaded keys of session
//             cmd = cmd + " && keyctl clear @s \\\n";
//             // upload files to encrypted directory
//             cmd = cmd + " && rsync -ra " + tmp + "/ " + src + "/ \\\n";
//             cmd = cmd + " && umount -l " + src + "/ \\\n";
//             // add sign that fs already encrypted
//             cmd = cmd + " && touch " + src + "/.crypted \\\n";
//             // if error happened on any stage of previous commands, try clean session, unmount and return false
//             cmd = cmd + " || ( keyctl clear @s ; umount -l " + src + " ; false )";
//             // keys clear and umount appear twice
//             //                logger.info("cmd:\n" + cmd); //!!! Don't uncomment it, show password and key in log
//             exec(cmd, function(error, stdout, stderr) {
//                 if (error) {
//                     callback("fail in encryptFolderLocked");
//                 } else
//                     callback(null);
//             });
//         }
//     ], function(err) {
//         if (err)
//             logger.info("User.encryptFolderLocked has been finished with error (" + err + ")");
//         callback(err);
//     });
// }

// function encryptUserStorageFolders(UserName, deviceID, keys, callback) {
//     var dev_dir = Common.nfshomefolder + userModule.getUserStorageFolder(UserName);
//     var dev_dir_nonenc = dev_dir.substring(0, dev_dir.length - 1) + "_nonencrypted";
//     var isCrypted = false;
//     async.series([
//         function(callback) {
//             var flag = dev_dir + ".crypted";
//             Common.fs.exists(flag, function(exists) {
//                 if (exists) {
//                     isCrypted = true;
//                     callback("already done");
//                 } else
//                     callback(null);
//             });
//         },
//         function(callback) {
//             Common.fs.exists(dev_dir_nonenc, function(exists) {
//                 if (!exists) {
//                     callback(null);
//                 } else {
//                     var msg = "oops... directory " + dev_dir_nonenc + " already exist";
//                     logger.info(msg);
//                     callback(msg);
//                 }
//             });
//         },
//         function(callback) {
//             encryptFolderLocked(dev_dir, dev_dir_nonenc, keys, callback);
//         }
//     ], function(err, results) {
//         console.log("Finish encryptUserStorageFolders with err:" + err);
//         if (isCrypted)
//             callback(null);
//         else
//             callback(err);
//     });
// }



/**
 *    Searches for new_user.tar.gz. If it doesn;t exist the creates one from the platform obj.
 *    @platform - The platform from which we will generate the tar
 *    @callback
 **/
var createNewUserTar = function(platform, callback) {

    var pathToNfs = Common.nfshomefolder;

    var packagesListSrcFile = commonUtils.buildPath(pathToNfs, 'apks/packages.list');
    var packagesListDstFile = commonUtils.buildPath(pathToNfs, 'packages.list');

    var pathToSrcTar = commonUtils.buildPath(pathToNfs, 'apks', NEW_USER_TAR);
    var pathToDstTar = commonUtils.buildPath(pathToNfs, NEW_USER_TAR);

    var pathToTmpDir = commonUtils.buildPath(pathToNfs, 'tmp');

    var localid;

    fs.stat(pathToDstTar, function(err, stats) {
        if (!err) {
            logger.info('Found ' + Common.nfshomefolder + NEW_USER_TAR);
            return callback(null);
        }

        logger.info('Cannot find ' + pathToDstTar + ' , Creating a new file');
        async.series([
            function(callback) {
                platform.createNewUserTarGz(callback);
            },
            // Copy new_user.tar.gz to its directory
            function(callback) {
                logger.info('Copying ' + pathToSrcTar + ' to ' + pathToDstTar);
                copyFile(pathToSrcTar, pathToDstTar, {}, callback);
            },
            // Copy new_user.tar.gz to its directory
            function(callback) {
                logger.info('Copying ' + packagesListSrcFile + ' to ' + packagesListDstFile);
                copyFile(packagesListSrcFile, packagesListDstFile, {}, callback);
            },
            // Delete new_user.tar.gz from apks/
            function(callback) {
                logger.info('Deleting ' + pathToSrcTar);
                Common.fs.unlink(pathToSrcTar, function(err) {
                    if (!err)
                        logger.info('Removed ' + NEW_USER_TAR + ' from apks');
                    callback(err);
                });
            },
            // Delete new_user.tar.gz from apks/
            function(callback) {
                Common.fs.unlink(packagesListSrcFile, function(err) {
                    if (!err)
                        logger.info('Removed ' + 'packages.list' + ' from apks');
                    callback(err);
                });
            },
            // Create tmp dir and open tar
            function(callback) {
                Common.fs.mkdir(pathToTmpDir, function(err) {
                    var tarParams = ["xvzf", pathToDstTar, "-C", pathToTmpDir];
                    execFile(Common.globals.TAR, tarParams, function(err, stdout, stderr) {
                        if (err) {
                            logger.error("createNewUserTar: " + stderr);
                            callback("failed extracting " + pathToDstTar);
                            return;
                        }

                        callback(null);
                    });
                });
            },
            // Copy OfficeSuite files to OfficeSuite directory
            function(callback) {
                var src = 'utils/new_user_files/device/';
                var dst = commonUtils.buildPath(pathToTmpDir, "user/");
                var rsyncParams = ["-ra", src, dst];
                execFile(Common.globals.RSYNC, rsyncParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.warn("createNewUserTar: " + stderr);
                        logger.warn("createNewUserTar: failed syncing " + src + " to " + dst);
                        callback(null);
                        return;
                    }

                    callback(null);
                });
            },
            // fix_apps
            function(callback) {
                var fixAppsParams = [pathToTmpDir + "/misc/profiles/cur", pathToNfs];
                execFile("scripts/fix_apps.sh", fixAppsParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.error("createNewUserTar: " + err);
                        callback("fix_apps.sh failed");
                        return;
                    }
                    callback(null);
                });
            },
            function(callback) {
                var fixAppsParams = [pathToTmpDir + "/user", pathToNfs];
                execFile("scripts/fix_apps.sh", fixAppsParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.error("createNewUserTar: " + err);
                        callback("fix_apps.sh failed");
                        return;
                    }
                    callback(null);
                });
            },
            function(callback) {
                var fixAppsParams = [pathToTmpDir + "/user_de", pathToNfs];
                execFile("scripts/fix_apps.sh", fixAppsParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.error("createNewUserTar: " + err);
                        callback("fix_apps.sh failed");
                        return;
                    }
                    callback(null);
                });
            },
            // Re-create tar
            function(callback) {
                var tarParams = ["-czf", pathToDstTar, "-C", pathToTmpDir, '.'];
                execFile(Common.globals.TAR, tarParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.error("createNewUserTar: " + stderr);
                        callback("failed to zip folder");
                        return;
                    }

                    callback(null);
                });
            },
            // Delete tmp dir
            function(callback) {
                var rmParams = ["-rf", pathToTmpDir];
                execFile(Common.globals.RM, rmParams, function(err, stdout, stderr) {
                    if (err) {
                        logger.warn("createNewUserTar: " + stderr);
                        logger.warn("createNewUserTar: failed to remove " + pathToTmpDir);
                    }

                    callback(null);
                });
            }
        ], function(err) {
            if (err) {
                logger.error('createNewUserTar: ' + err);
                callback(err);
                return;
            }

            callback(null);
        });
    });
}



function getUserPass(email, callback) {
    Common.db.User.findAll({
        attributes: ['orguser', 'orgpassword'],
        where: {
            email: email
        }
    }).complete(function(err, results) {
        if (!!err) {
            var msg = "Error while getUserPass while selecting user: " + err;
            logger.info(msg);
            callback(msg);
            return;
        }

        // There must be a result if no error had occcurred
        var orguser = results[0].orguser != null ? results[0].orguser : '';
        var orgpassword = Common.dec(results[0].orgpassword);
        var userObj = {
            username: orguser,
            password: orgpassword
        }
        callback(null, userObj);
    });

}





var getUserDataSize = function(user, callback) {
    var duParams = ["--max-depth=0", "-B1024", Common.nfshomefolder + userModule.getUserHomeFolder(user)];
    execFile(Common.globals.DU, duParams, function(error, stdout, stderr) {
        if (error) {
            callback("getUserDataSize:" + error);
        } else {
            callback(null, parseInt(stdout));
        }
    });
}

var postNewUserProcedure = function(email, domain, logger, callback) {
    async.series(
        [
            function(callback) {
                require("./ControlPanel/addProfilesToGroup.js").addProfilesToGroupInternal("All", domain, "", false, [email], function(err) {
                    if (err) {
                        logger.error("createUser cannot attach user " + email + " to group All of domain " + domain+", "+err);
                    }
                    callback(null);
                });
            }
        ],
        function(err) {
            callback(err);
        }
    );
}

function loadSettingsUpdateFile(userName, deviceID, settingsFileName,  dockerPlatform,folderParams, callback) {
    if (!settingsFileName) {
        settingsFileName = "startup.json";
    }

    var folderName;
    if (dockerPlatform) {
        folderName = commonUtils.buildPath(folderParams.dataTempFolder,"data");
    } else {
        folderName = commonUtils.buildPath(folderParams.userFolder,"user");
    }
    var fileName = commonUtils.buildPath(folderName, Common.settingsfolder,settingsFileName);
    //logger.info("loadSettingsUpdateFile: fileName = " + fileName);
    Common.fs.readFile(fileName, function(err, data) {
        if (err) {
            //logger.error("Error in loadSettingsUpdateFile: " + err);
            callback(err, {});
            return;
        }
        //logger.info("loaded file: " + data.toString());
        var res = JSON.parse(data.toString());
        callback(null, res);
    });
}

// https://login.nubosoftware.com/createOrReturnUserAndDomain?email=[email]
function createOrReturnUserAndDomainRestApi(req, res, next) {

    res.contentType = 'json';
    var email = req.params.email;
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    if (email != null && !require('./nubo_regex.js').emailRegex.test(email)) {
        res.send({
            status: 0,
            message: "Invalid or missing params"
        });
        return;
    }

    logger.user(email);
    logger.error("post createOrReturnUserAndDomainRestApi");
    createOrReturnUserAndDomain(email, logger, function(err, resObj, userObj, orgObj) {
        if (err) {
            logger.error("createOrReturnUserAndDomainRestApi: " + err);
            res.send({
                status: 0,
                message: err
            });
            return;
        }

        res.send({
            status: 1,
            resObj: resObj,
            userObj: userObj,
            orgObj: orgObj
        });
        return;
    });
}

// https://login.nubosoftware.com/createDomainForUser?domain=[domain]
function createDomainForUserRestApi(req, res, next) {
    logger.error("post createDomainForUserRestApi");
    res.contentType = 'json';
    var domain = req.params.domain;

    createDomainForUser(domain, logger, function(err, resObj) {
        if (err) {
            logger.error("createDomainForUserRestApi: " + err);
            res.send({
                status: 0,
                message: err
            });
            return;
        }

        res.send({
            status: 1,
            resObj: resObj
        });
        return;
    });
}

// https://login.nubosoftware.com/updateUserAccount
function updateUserAccountRestApi(req, res, next) {
    logger.error("post updateUserAccountRestApi");
    res.contentType = 'json';
    var obj = req.body;

    updateUserAccount(obj.registrationEmail, obj.orgEmail, obj.authType, obj.serverURL, obj.domain,
        obj.orgUser, obj.orgPassword, obj.secureSSL, obj.signature, obj.fromDevice, obj.updateOtherDevices, obj.updateMainDevice,
        function(err) {
            if (err) {
                logger.error("updateUserAccountRestApiRestApi: " + err);
                res.send({
                    status: 0,
                    message: err
                });
                return;
            }

            res.send({
                status: 1
            });
            return;
        });
}



// https://login.nubosoftware.com/createUserFolders
/*function createUserFoldersRestApi(req, res, next) {
    logger.error("post createUserFoldersRestApi");
    res.contentType = 'json';
    var obj = req.body;

    createUserFolders(obj.email, obj.deviceid, obj.overwrite, obj.time, obj.hrTime, function(err) {
        if (err) {
            logger.error("createUserFoldersRestApi: " + err);
            res.send({
                status: 0,
                message: err
            });
            return;
        }

        res.send({
            status: 1
        });
        return;
    }, obj.demoUser);
}*/

function deleteUserFolders(email, nfsObj, callback) {
    var userFolder = userModule.getUserHomeFolder(email);
    var folder = nfsObj.params.nfs_path + userFolder;
    logger.info("Delete folder: " + folder);
    var rmParams = ["-rf", folder];
    execFile(Common.globals.RM, rmParams, function(err, stdout, stderr) {
        if (err) {
            logger.warn("delete user folders: " + stderr);
            logger.warn("delete user folders: failed to remove " + folder);
        }
        callback(err);
    });
}

// https://login.nubosoftware.com/saveSettingsUpdateFile
function saveSettingsUpdateFileRestApi(req, res, next) {

    logger.error("saveSettingsUpdateFileRestApi: TODO - validate paramters");
    res.send({
        status: 0,
        message: "saveSettingsUpdateFileRestApi: Not implemented"
    });
    return;
}

function wipeUserDevice(email,cb) {
    let sessionModule = require('./session.js');
    let StartSession = require('./StartSession.js');
    let nfsModule = require('./nfs.js');

    let nfs;

    async.series([
        (cb) => {
            // end all session of that user
            sessionModule.getSessionsOfUser(email, function(sessions) {
                async.eachSeries(sessions, function(session, callback) {
                    var sessId = session.params.sessid;
                    StartSession.endSession(sessId, function(err) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        logger.info("Killed session: " + sessId);
                        callback(null);
                    });
                }, function(err) {
                    if (err) {
                      logger.info("Kill session err: " + err);
                    }
                    cb(err);
                });
            });
        },
        (cb) => {
            nfsModule({
                nfs_idx: Common.nfsId,
                logger: logger
            },
            function(err, nfsobj) {
                if (err) {
                    cb("cannot create nfs obect err: " + err);
                    return;
                }

                nfs = nfsobj;
                cb(null);
            });
        },
        (cb) => {
            deleteUserFolders(email,nfs,cb);
        }
    ],(err) => {
        cb(err);
    });

}

// status:
// -1: error
//  0: finished installation successfully
//  1: Copying app
//  2: Installing app on all platforms
function updateAppProgress(appType,packageName, fileName, versionName, versionCode, maindomain, appName, appDescription, price, status, errorMsg, callback) {


    // before insert / update, check if packagename is found in database
    Common.db.Apps.findAll({
        attributes: ['packagename'],
        where: {
            packagename: packageName,
            maindomain: maindomain
        },
    }).complete(function (err, results) {

        if (!!err) {
            logger.error(err);
            callback("Internal error: " + err);

        }
        // no packagename, run insert method
        if (!results || results == "") {
            Common.db.Apps.create({
                packagename: packageName,
                apptype: appType,
                filename: fileName,
                versionname: versionName,
                versioncode: versionCode,
                maindomain: maindomain,
                appname: appName,
                price: price,
                status: status,
                err: errorMsg,
                description: appDescription
            }).then(function (obj) {
                callback(null);

            }).catch(function (err) {
                logger.error(err);
                callback("Internal error: " + err);
            });

        } else {
            // found packagename in db, update result
            Common.db.Apps.update({
                // TODO - below comment need to be removed when Platform per organization is committed
                //maindomain : maindomain,
                apptype: appType,
                filename: fileName,
                versionname: versionName,
                versioncode: versionCode,
                appname: appName,
                price: price,
                status: status,
                err: errorMsg,
                description: appDescription
            }, {
                    where: {
                        packagename: packageName,
                        // TODO - below comment need to be removed when Platform per organization is committed
                        //maindomain : maindomain
                    }
                }).then(function () {
                    callback(null);
                }).catch(function (err) {
                    logger.error(err);
                    callback("Internal error: " + err);
                });
        }
    });

    if (Common.isMobile() && status == 0 && appType != "deb" && Common.appstore && Common.appstore.enable === true) {
        // Update app store adter sucessfull install
        Common.getMobile().appStore.updateRepo(maindomain,packageName,() => {});
    }
}

module.exports = {
    createDomainForUser: createDomainForUser,
    createOrReturnUserAndDomain: createOrReturnUserAndDomain,
    updateUserAccount: updateUserAccount,
    saveSettingsUpdateFile: saveSettingsUpdateFile,
    createUserFolders: createUserFolders,
    validateUserFolders: validateUserFolders,
    createNewUserTar: createNewUserTar,
    getUserDataSize: getUserDataSize,
    postNewUserProcedure: postNewUserProcedure,
    createOrReturnUserAndDomainRestApi: createOrReturnUserAndDomainRestApi,
    createDomainForUserRestApi: createDomainForUserRestApi,
    updateUserAccountRestApi: updateUserAccountRestApi,
    //createUserFoldersRestApi: createUserFoldersRestApi,
    copyFile: copyFile,
    saveSettingsUpdateFileRestApi: saveSettingsUpdateFileRestApi,
    setAdminInDB: setAdminInDB,
    addAppToProfile: addAppToProfile,
    setAdminInDBRestApi: setAdminInDBRestApi,
    deleteUserFolders: deleteUserFolders,
    getUserPass: getUserPass,
    addSettingsToSpecificDevice: addSettingsToSpecificDevice,
    updateDeviceTelephonySettings: updateDeviceTelephonySettings,
    updateDeviceTelephonySettingsImp,
    getAppListForUser,
    wipeUserDevice,
    AddSettingToNewDevice,
    postNewOrgProcedure,
    updateAppProgress,
    getDefaultApps,
    mountUserData,
    unMountUserData,
    resizeUserData,

};

