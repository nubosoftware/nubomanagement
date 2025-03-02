"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var crypto = require('crypto');
var util = require('util');
var Login = require('./login.js');
var async = require('async');
var ThreadedLogger = require('./ThreadedLogger.js');
var Otp = require('./otp.js');
var CommonUtils = require("./commonUtils.js");
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

var MIN_DIFFERENT_DIGITS = 4;


function validatePassword(logger, password) {
    // check valid password length
    if (password == null || password.length < 6) {
        logger.info("setPasscode::password is shorter 6 digits");
        return 0;
    }

    // check for valid different numbers in password
    var counter = 0;
    var minimumChars = [];
    var passwordChars = password.split('');
    var minimumCharsContains = false;
    var hasRequestedDifferentDigits = false;
    for (var i = 0; i < passwordChars.length; i++) {
        for (var j = 0; j < counter; j++) {
            if (minimumChars[j] == passwordChars[i]) {
                minimumCharsContains = true;
                break;
            }
        }
        if (!minimumCharsContains) {
            // update different chars we have so far
            minimumChars[counter] = passwordChars[i];
            counter++;
        }
        // password is valid if there are at least 4 different chars
        if (counter >= MIN_DIFFERENT_DIGITS) {
            hasRequestedDifferentDigits = true;
            break;
        }
        minimumCharsContains = false;
    }
    if (!hasRequestedDifferentDigits) {
        logger.info("setPasscode::password must be at least " + MIN_DIFFERENT_DIGITS + " different digits");
        return 0;
    }

    // check if password is consecutive numbers
    var isConsecutive = true;
    for (var i = 0; i < passwordChars.length - 1; i++) {
        if (parseInt(passwordChars[i]) + 1 != parseInt(passwordChars[i + 1])) {
            isConsecutive = false;
            break;
        }
    }
    if (isConsecutive) {
        logger.info("setPasscode::password can't be consecutive numbers ");
        return 0;
    }

    // passed all validations
    return 1;

}

function setPasscode(req, res, loginObj) {
    // https://oritest.nubosoftware.com/setPasscode?loginToken=[]&passcode=[]&oldpasscode=[]
    res.contentType = 'json';
    const finish = "__finish";

    //read and validate params
    var loginToken = req.params.loginToken;
    var passcode = req.params.passcode;
    var oldpasscode = req.params.oldpasscode;
    var passcode2 = req.params.passcode2;
    var clientIP = req.header('x-client-ip');

    var login;
    var webClient;

    var response = {
        status: Common.STATUS_ERROR,
        message: 'Internal error'
    };

    var decryptedPassword,decryptedPassword2;
    var logger = new ThreadedLogger(Common.getLogger(__filename));

    var passcodetypechange;
    var passcodeTypePrev;
    var dbPasscode;
    var passcodeSalt;

    async.series([
        function(callback) {
            if (loginObj && loginObj.loginToken) {
                loginToken = loginObj.loginToken;
                login = loginObj;
                logger.user(login.getEmail());
                logger.device(login.getDeviceID());
                webClient = login.getDeviceID().includes("web");
                logger.info("loginObj is valid");
                callback(null);
                return;
            }
            new Login(loginToken, function(err, loginObj) {
                if (err) {
                    return callback(err);
                }

                if (!loginObj) {
                    response.status = Common.STATUS_EXPIRED_LOGIN_TOKEN;
                    response.message = "Invalid loginToken";
                    loginToken = 'notValid';

                    return callback("shouldn't get this error!!!");
                }

                login = loginObj;
                logger.user(login.getEmail());
                webClient = login.getDeviceID().includes("web");
                callback(null);
            });
        },
        function(callback) {
            if (Common.restrictWebClientAccess && webClient) {
                if (CommonUtils.webclientAllowedToaccess(clientIP)) {
                    return callback(null);
                } else {
                    return callback("web client accesses from unallowed network, shouldn't get here!!!!!!!!");
                }
            }

            callback(null);
        },
        function(callback) {
            Common.db.User.findAll({
                attributes: ['passcodetypechange', 'passcodetypeprev', 'passcode' , 'passcodesalt'],
                where: {
                    orgdomain: login.getMainDomain(),
                    email: login.getEmail()
                },
            }).complete(function(err, results) {
                if (!!err) {
                    return callback(err);
                }

                if (!results || results == "") {
                    response.status = Common.STATUS_ERROR;
                    response.message = "Cannot find user or user is inactive";
                    return callback("Cannot find user or user is inactive");
                }

                passcodetypechange = results[0].passcodetypechange != null ? results[0].passcodetypechange : 0;
                passcodeTypePrev = results[0].passcodetypeprev != null ? results[0].passcodetypeprev : 0;
                dbPasscode = results[0].passcode;
                passcodeSalt = results[0].passcodesalt;
                callback(null);
            });
        },
        function(callback) {
            if (!oldpasscode) {
                if (login.getPasscodeActivationRequired() != "true") {
                    response.message = "passcode activation not allowed";
                    return callback(response.message);
                } else {
                    return callback(null)
                }

            }

            if (webClient || !Common.virtualKeyboardEnabled || !Common.isEnterpriseEdition()) {
                var hashedPasscode = hashPassword(oldpasscode,passcodeSalt);
                if (dbPasscode !== hashedPasscode) {
                    response.message = "passcode change not allowed";
                    return callback(response.message);
                } else {
                    return callback(null);
                }
            }

            if (passcodetypechange === 1 && passcodeTypePrev === 0) {
                logger.warn("setPasscode: user in process change from passcode to password (no virtual keyboard)");
                decryptedPassword = passcode;
                return callback(null);

            }

            Common.getEnterprise().passwordUtils.virtaulKeyboardDecrypt(login,oldpasscode,false,null,null,function(err,decPass) {
                if (err) {
                    callback(err);
                    return;
                }
                var hashedPasscode = hashPassword(decPass, passcodeSalt);
                if (dbPasscode !== hashedPasscode) {
                    response.message = "passcode change not allowed";
                    return callback(response.message);

                }
                return callback(null);
            });
        },
        function(callback) {
            if (webClient || !Common.virtualKeyboardEnabled || !Common.isEnterpriseEdition()) {
                if (validatePassword(logger, passcode) === 0) {
                    response.status = Common.STATUS_ERROR;
                    response.message = "Invalid passcode";
                    return callback(response.message);
                } else {
                    decryptedPassword = passcode;
                    return callback(null);
                }
            }

            Common.getEnterprise().passwordUtils.virtaulKeyboardDecrypt(login,passcode,true,passcode2,response,function(err,decPass) {
                if (err) {
                    callback(err);
                    return;
                }
                decryptedPassword = decPass;
                return callback(null);
            });
        },
        // update passcode history
        function(callback) {
            checkPasscodeHistory(login, decryptedPassword, finish, function(err) {
                if (err) {
                    response.status = Common.STATUS_ERROR;
                    if (err == finish) {
                        response.message = "Passcode already exists, choose a different passcode";
                    }
                }
                callback(err);
            });
        },
        function(callback) {
            if (Common.isEnterpriseEdition()) {
                Common.getEnterprise().passwordUtils.afterPasscode(true,login,webClient,response,callback);
            } else {
                callback(null);
            }
        },
        function(callback) {
            // generate user hash
            var salt = generateUserSalt(login.getEmail());
            var passwordHash = hashPassword(decryptedPassword,salt);
            Common.db.User.update({
                passcodeupdate: new Date(),
                passcode: passwordHash,
                passcodetypechange: 0,
                passcodesalt: salt
            }, {
                where: {
                    email: login.getEmail()
                }
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                response.status = Common.STATUS_ERROR;
                response.message = 'Internal error';
                callback(err);
            });
        },
        function(callback) {
            Common.db.Activation.update({
                resetpasscode: 0
            }, {
                where: {
                    activationkey: login.getActivationKey()
                }
            }).then(function() {
                login.setPasscodeActivationRequired(false);
                login.setValidPassword(true);
                callback(null);
            }).catch(function(err) {
                console.log(err)
                callback(err);
            });
        },
        function(callback) {
            if (!response.additionalEnterpriseMethodRequired) {
                response.status = Common.STATUS_OK;
                response.message = "Passcode updated";
                login.setValidLogin(true);
            }

            login.save(callback);
        },
        function(callback) {
            callback(null);


        }
    ], function(err) {

        if (err) {
            if (err === finish) {
                logger.warn("setPasscode, finish: ");
            } else {
                logger.error("setPasscode: " + err + ", login: " + login);
                /*if (login) {
                    login.delete(function() {});
                }*/
            }
        }

        res.send(response);
        return;
    });
}


var genRandomString = function(length){
    return crypto.randomBytes(Math.ceil(length/2))
            .toString('hex') /** convert to hexadecimal format */
            .slice(0,length);   /** return required number of characters */
};

var hashPassword = function(password, salt){
    let encPass;
    if (salt && salt.length > 0) {
        let hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
        hash.update(password);
        encPass = hash.digest('hex');
    } else {
        encPass = Common.encOld(password);
    }
    return encPass;
};

var generateUserSalt = function(username) {
    if (Common.savedPasscodeHistory > 0) {
        // we cannot use random salt ebcause we save passcode history - return user name as salt.
        return username;
    } else {
        return genRandomString(16);
    }
};

/**
 * Internal function used to updated user password.
 * The only a salted hash is saved to the database
 * @param {String} email
 * @param {String} newPassword
 */
var updateUserPasswordImp = async function (email,newPassword) {
    let salt = generateUserSalt(email);
    let passwordHash = hashPassword(''+newPassword,salt);
    await Common.db.User.update({
        passcodeupdate: new Date(),
        passcode: passwordHash,
        passcodetypechange: 0,
        passcodesalt: salt
    }, {
        where: {
            email: email
        }
    });
}






function checkPasscodeHistory(login, decryptedPassword, finish, callback) {

    if (Common.savedPasscodeHistory <= 0) {
        callback(null);
        return;
    }

    Common.db.PasscodeHistory.findAndCountAll({
        where: {
            maindomain: login.getMainDomain(),
            email: login.getEmail()
        },
        order: 'lastupdate',
    }).then(function (result) {
        var count = result.count;
        var salt = generateUserSalt(login.getEmail());
        var newPasscode = hashPassword(decryptedPassword,salt);
        var ret = false;
        // get all saved passcodes of the user
        if (result && result.rows.length > 0) {

            result.rows.forEach(function (row) {
                var oldPasscode = row.passcode != null ? row.passcode : '';
                // check if the passcode record is already in db
                if (oldPasscode == newPasscode) {
                    ret = true;
                    return;
                }
            });
        }

        if (ret) {
            callback(finish);
            return;
        }

        if (count < Common.savedPasscodeHistory) {

            Common.db.PasscodeHistory.create({
                email: login.getEmail(),
                passcode: newPasscode,
                maindomain: login.getMainDomain(),
                lastupdate: new Date()
            }).then(function (results) {
                callback(null);
            }).catch(function (err) {
                var msg = "error on insert passcode history to db: " + err;
                logger.info(msg);
                callback(msg);
            });

        } else {
            var row = result.rows[0];
            var email = row.email != null ? row.email : '';
            var lastUpdate = row.lastupdate != null ? row.lastupdate : '';
            var mainDomain = row.maindomain != null ? row.maindomain : '';

            Common.db.PasscodeHistory.update({
                passcode: newPasscode,
                lastupdate: new Date(),
            }, {
                where: {
                    email: email,
                    lastupdate: lastUpdate,
                    maindomain: mainDomain
                }
            }).then(function () {
                callback(null);
            }).catch(function (err) {
                var msg = "setPasscode. Error on updating passcode history: " + err;
                logger.error(msg);
                callback(msg);
            });
        }

    });
}

const defaultAdminSecurityConfig = `{
    "minLength": 9,
    "requiredCharacterTypes": ["uppercase", "lowercase", "number", "special"],
    "avoidUserId": true,
    "noRepeatedChars": true,
    "noSequentialChars": true,
    "passwordHistoryMonths": 3,
    "maxLoginAttempts": 3
}`;

async function getAdminSecurityConfig(domain) {
    const org = await Common.db.Orgs.findOne({
        attributes: ['admin_security_config'],
        where: {
            maindomain: domain
        }
    });
    const adminSecurityConfigStr = org?.admin_security_config;
    if (!adminSecurityConfigStr) {
        adminSecurityConfigStr = defaultAdminSecurityConfig;
    }
    const adminSecurityConfig = JSON.parse(adminSecurityConfigStr);
    if (adminSecurityConfig.maxLoginAttempts === undefined) {
        adminSecurityConfig.maxLoginAttempts = 3;
    }
    return adminSecurityConfig;
}

async function checkAdminPasswordHistory(email, historyHash, domain) {
    try {
        // check the org policy
        const adminSecurityConfig = await getAdminSecurityConfig(domain);
        if (adminSecurityConfig.passwordHistoryMonths > 0) {
            // check the password history
            const result = await Common.db.PasscodeHistory.findAll({
                where: {
                    email: `${email}_admin`,
                    passcode: historyHash,
                    maindomain: domain,
                    lastupdate: {
                        [Op.gt]: new Date(Date.now() - adminSecurityConfig.passwordHistoryMonths * 30 * 24 * 60 * 60 * 1000)
                    }
                }
            });
            if (result.length > 0) {
                logger.info(`checkAdminPasswordHistory. Password history check failed for email: ${email}, domain: ${domain}, last password change: ${result[0].lastupdate}`);
                return { validPassword: false, message: 'Password history check failed' };
            }

            // add the new password to the history
            await Common.db.PasscodeHistory.create({
                email: `${email}_admin`,
                passcode: historyHash,
                maindomain: domain,
                lastupdate: new Date()
            });
            return { validPassword: true, message: 'Password history check passed' };
        } else {
            return { validPassword: true, message: 'No password history policy set, allow the password change' };
        }

    } catch (error) {
        logger.error(`checkAdminPasswordHistory. Error: ${error}`);
        return { validPassword: false, message: 'Internal error' };
    }
}

var setPasscodeE = {
    func: setPasscode,
    validatePassword: validatePassword,
    checkPasscodeHistory: checkPasscodeHistory,
    generateUserSalt: generateUserSalt,
    hashPassword: hashPassword,
    updateUserPasswordImp,
    checkAdminPasswordHistory,
    getAdminSecurityConfig
};

module.exports = setPasscodeE;