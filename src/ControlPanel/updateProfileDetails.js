"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var request = require('request');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');
var url = require('url');
var https = require('https');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function updateProfileDetails(req, res, next) {
    // https://login.nubosoftware.com/activateProfiles?session=[]&email[]&email=[]..
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var email = req.params.email;
    if (!email || email == "") {
        logger.info("updateProfileDetails. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var first = req.params.first;
    var last = req.params.last;
    var officePhone = req.params.officePhone;
    var mobilePhone = req.params.mobilePhone;
    var manager = req.params.manager;
    var country = req.params.country;
    var recording = parseInt(req.params.recording);

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

        updateProfileDetailsInDB(res, first, last, officePhone, mobilePhone, manager, country, email, domain,recording,req.params);
    });
}

function updateProfileDetailsInDB(res, first, last, officePhone, mobilePhone, manager, country, email, domain,recording,params) {

    let obj = {
        firstname : first,
        lastname : last,
        officephone : officePhone,
        mobilephone : mobilePhone,
        manager : manager,
        country : country
    };
    if (typeof recording !== 'undefined' && !isNaN(recording) && recording != '') {
        // logger.info(`recording: [${recording}]`);
        obj.recording = recording;
    }
    if (params.orguser != undefined) {
        obj.orguser = params.orguser;
    }
    if (params.orgemail != undefined) {
        obj.orgemail = params.orgemail;
    }
    if (params.password != undefined) {
        logger.info(`updateProfileDetailsInDB. Update password for user: ${email}`);
        const setPasscode = require('../setPasscode.js');
        const salt = setPasscode.generateUserSalt(email);
        const passwordHash = setPasscode.hashPassword(params.password,salt);
        obj.passcodeupdate = new Date();
        obj.passcode = passwordHash;
        obj.passcodetypechange = 0;
        obj.passcodesalt= salt;
    }
    if (params.isActive != undefined) {
        const isactive = Number(params.isActive);
        if (isactive === 0 || isactive === 1) {
            // logger.info(`updateProfileDetailsInDB. Update isactive for user: ${email} to ${isactive}`);
            obj.isactive = isactive;
        } else {
            logger.info(`updateProfileDetailsInDB. Invalid isactive value: ${params.isActive}`);
        }
    }
    Common.db.User.update(obj , {
        where : {
            email : email,
            orgdomain : domain
        }
    }).then(function() {
        res.send({
            status : 1,
            message : "The profile was updated successfully"
        });

    }).catch(function(err) {
        var errormsg = 'Error on updating profile details: ' + err;
        logger.error(errormsg,err);
        res.send({
            status : 0,
            message : errormsg
        });
        return;
    });

}

var UpdateProfileDetails = {
    get : updateProfileDetails
};

module.exports = UpdateProfileDetails;
