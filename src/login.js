"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);

module.exports = function(token, callback) {
    this.loginToken = token;

    //console.log("token="+token);
    //console.log("this.loginToken="+this.loginToken);

    this.loginParams = {
        isLogin : false,
        isValidPassword: false
    };

    this.save = function(callback) {

        (function(login) {
            Common.redisClient.hmset('login_' + login.loginToken, login.loginParams, function(err, obj) {
                if (err) {
                    logger.info("Error in save hmset:" + err);
                    callback(err, null);
                    return;
                } else {
                    let exptime;
                    if (login.loginParams.adminLogin == 1) {
                        exptime = 60 * 60;
                    } else {
                        exptime = 60 * 10;
                    }
                    Common.redisClient.expire('login_' + login.loginToken, exptime, function(err, obj) {
                        //if (callCallBack) {
                        //logger.info("login.loginParams.loginToken="+login.loginParams.loginToken);
                        callback(err, login);

                    });
                    //}
                }
            });
        })(this);
    };

    this.delete = function(callback){
         Common.redisClient.del("login_" + this.loginParams.loginToken, callback);
    }

    this.setEmail = function(email) {
        this.loginParams.email = email;
    };

    this.setUserName = function(userName) {
        this.loginParams.userName = userName;
    };

    this.setImUserName = function(imUserName) {
        this.loginParams.imUserName = imUserName;
    };

    this.setIsAdmin = function(isAdmin) {
        this.loginParams.isAdmin = isAdmin;
    };

    this.setIsActive = function(isActive) {
        this.loginParams.isActive = isActive;
    };

    this.setMainDomain = function(mainDomain) {
        this.loginParams.mainDomain = mainDomain;
    };

    this.setPlatformDomain = function(platDomain) {
        this.loginParams.platformDomain = platDomain;
    };

    this.setAdminPermissions = function(json) {
        this.loginParams.adminPermissions = json;
    };

    this.setAdminConsoleLogin = function(adminLogin) {
        this.loginParams.adminLogin = adminLogin;
    };

    this.setSiteAdmin = function(siteAdmin) {
        this.loginParams.siteAdmin = siteAdmin;
    };

    this.setActivationKey = function(activationKey) {
        this.loginParams.activationKey = activationKey;
    };

    this.setAuthenticationRequired = function(authenticationRequired) {
        this.loginParams.authenticationRequired = authenticationRequired;
    };
    this.setPasscodeActivationRequired = function(passcodeActivationRequired) {
        this.loginParams.passcodeActivationRequired = passcodeActivationRequired;
    };

    this.setValidLogin = function(isLogin) {
        this.loginParams.isLogin = (isLogin && this.checkValidLogin());
    };

    this.checkValidLogin = function () {
        if (this.loginParams.adminLogin == 1) {
            if (this.loginParams.isValidPassword)
                return true;
            else
                return false;
        } else if (this.loginParams.clientauthtype == Common.CLIENT_AUTH_TYPE_NONE) {
            return true;
        } else if (this.loginParams.clientauthtype == Common.CLIENT_AUTH_TYPE_PASSWORD) {
            if (this.loginParams.isValidPassword)
                return true;
            else
                return false;
        } else if (this.loginParams.clientauthtype == Common.CLIENT_AUTH_TYPE_BIOMETRIC_OTP) {
            if (this.loginParams.isValidSecondAuth)
                return true;
            else
                return false;
        } else if (this.loginParams.clientauthtype == Common.CLIENT_AUTH_TYPE_PASSWORD_AND_BIOMETRIC_OTP) {
            let webClient = this.getDeviceID().includes("web");
            if (this.loginParams.isValidPassword && (this.loginParams.isValidSecondAuth || webClient))
                return true;
            else
                return false;
        } else if (this.loginParams.clientauthtype == Common.CLIENT_AUTH_TYPE_PASSWORD_OR_BIOMETRIC_OTP) {
            if (this.loginParams.isValidPassword || this.loginParams.isValidSecondAuth)
                return true;
            else
                return false;
        }
    }

    this.setValidPassword = function(isValidPassword) {
        this.loginParams.isValidPassword = isValidPassword;
    };

    this.isValidPassword = function() {
        return  this.loginParams.isValidPassword;
    };

    this.setValidSecondAuth = function(isValid) {
        this.loginParams.isValidSecondAuth = isValid;
    };

    this.isValidSecondAuth = function() {
        return  this.loginParams.isValidSecondAuth;
    };

    this.getClientAuthType = function() {
        return this.loginParams.clientauthtype;
    }

    this.getSecondAuthMethod = function() {
        return this.loginParams.secondauthmethod;
    }

    this.setSecondFactorAuth = function(authType) {
        this.loginParams.secondAuthType = authType;
    }

    this.getSecondFactorAuth = function() {
        return this.loginParams.secondAuthType;
    }

    this.increaseOtpCounter = function() {
        var c = this.getOtpCounter();
        this.loginParams.otpTriesCounter = ++c;
    }

    this.setOtpCounter = function() {
        this.loginParams.otpTriesCounter = 0;
    }

    this.getOtpCounter = function() {
        return parseInt(this.loginParams.otpTriesCounter);
    }

    this.setDeviceID = function(deviceID) {
        this.loginParams.deviceID = deviceID;
    };

    this.setFirstLogin = function(firstLogin) {
        this.loginParams.firstLogin = firstLogin;
    };

    this.setDeviceName = function(deviceName) {
        this.loginParams.deviceName = deviceName;
    };

    this.setDeviceType = function(deviceType) {
        this.loginParams.deviceType = deviceType;
    };

    this.setLang = function(languege) {
        this.loginParams.lang = languege;
    };

    this.setCountryLang = function(countrylang) {
        this.loginParams.countrylang = countrylang;
    };

    this.setLocalevar = function(localevar) {
        this.loginParams.localevar = localevar;
    };

    this.setEncrypted = function(encrypted) {
        this.loginParams.encrypted = encrypted;
    };

    this.setDcname = function(dcname) {
        this.loginParams.dcname = dcname;
    };

    this.setDcurl = function(dcurl) {
        this.loginParams.dcurl = dcurl;
    };

    this.getOwaUrl = function() {
        return this.loginParams.owaurl;
    };

    this.getOwaUrlPostAuth = function() {
        return this.loginParams.owaurlpostauth;
    };

    this.getRefererUrl = function() {
        return this.loginParams.refererurl;
    };

    this.setOwaUrl = function(owaurl) {
        this.loginParams.owaurl = owaurl;
    };

    this.setOwaUrlPostAuth = function(owaurlpostauth) {
        this.loginParams.owaurlpostauth = owaurlpostauth;
    };

    this.setRefererUrl = function(refererurl) {
        this.loginParams.refererurl = refererurl;
    };

    this.getEmail = function() {
        return this.loginParams.email;
    };

    this.getUserName = function() {
        return this.loginParams.userName;
    };

    this.getImUserName = function() {
        return this.loginParams.imUserName;
    };

    this.getActivationKey = function() {
        return this.loginParams.activationKey;
    };

    this.getAuthenticationRequired = function() {
        return this.loginParams.authenticationRequired;
    };

    this.getPasscodeActivationRequired = function() {
        return this.loginParams.passcodeActivationRequired;
    };

    this.getIsAdmin = function() {
        return this.loginParams.isAdmin;
    };

    this.getIsActive = function() {
        return this.loginParams.isActive;
    };

    this.getMainDomain = function() {
        return this.loginParams.mainDomain;
    };

    this.getPlatformDomain = function() {
        return this.loginParams.platformDomain;
    }

    this.getAdminPermissions = function() {
        return this.loginParams.adminPermissions;
    }

    this.getAdminConsoleLogin = function() {
        return this.loginParams.adminLogin;
    };

    this.getSiteAdmin = function() {
        return this.loginParams.siteAdmin;
    };

    this.isValidLogin = function() {
        return (this.loginParams.isLogin && this.checkValidLogin());
    };
    this.getDeviceID = function() {
        return this.loginParams.deviceID;
    };

    this.getFirstLogin = function() {
        return this.loginParams.firstLogin;
    };

    this.getLoginToken = function() {
        return this.loginParams.loginToken;
    };

    this.getDcname = function() {
        return this.loginParams.dcname;
    };

    this.getDcurl = function() {
       return this.loginParams.dcurl;
    };


    this.authenticateUser = function(authUser, authPassword, callback) {
        this.authUser = authUser;

    };

    if (this.loginToken == null) {// generate new login token and new login object
        var buf = Common.crypto.randomBytes(48);
        this.loginToken = buf.toString('hex');
        this.loginParams.loginToken = this.loginToken;
        this.loginParams.isLogin = false;
        this.loginParams.isValidPassword = false;
        this.loginParams.userName = '';
        this.loginParams.imUserName = '';
        this.save(callback);
        //logger.info('wrote object: '+JSON.stringify(this));

    } else {//read login object from redis
        (function(login) {
            var reply = Common.redisClient.hgetall('login_' + login.loginToken, function(err, obj) {
                //console.dir(obj);
                if (err) {
                    logger.info("err:" + err);
                    callback(err, login);
                    return;
                }

                if (obj != null) {
                    login.loginParams = obj;

                    // replace true/false string with boolean type
                    if(login.loginParams.isValidPassword){
                        login.loginParams.isValidPassword = login.loginParams.isValidPassword === 'true' ? true : false;
                    }

                    if(login.loginParams.isLogin){
                        login.loginParams.isLogin = login.loginParams.isLogin === 'true' ? true : false;
                    }
                    //logger.info(`Login read. isLogin: ${login.loginParams.isLogin}, isValidPassword: ${login.loginParams.isValidPassword}`);

                    Common.redisClient.ttl('login_' + login.loginToken, function(err, obj) {
                        login.loginParams.ttl = obj;
                        callback(err, login);
                    });

                    return;
                } else {
                    logger.warn("Cannot find loginToken " + login.loginToken);
                    callback(null, null);
                    return;
                }
            });
        })(this);
        //logger.info('read object: '+JSON.stringify(reply));
    }
};

