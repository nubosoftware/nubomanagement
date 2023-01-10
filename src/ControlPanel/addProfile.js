"use strict";

/* @author Ori Sharon
 *  In this class we add a profile
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var User = require('../user.js');
var userUtils = require('../userUtils.js');
var setPasscode = require('../setPasscode.js');
var EMAIL_SIZE = 255; // this should be the same as in parameters-map --> addProfile --> email size.

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function addProfile(req, res, next) {

    // https://login.nubosoftware.com/addProfile?session=[]&first=[first]&last=[last]&email=[email]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var first = req.params.first;
    if (!first || first == "") {
        logger.info("addProfile. Invalid firstName ");
        status = 0;
        msg = "Invalid parameters";
    }

    var last = req.params.last;
    if (!last || last == "") {
        logger.info("addProfile. Invalid lastName");
        status = 0;
        msg = "Invalid parameters";
    }

    var email = req.params.email;
    if (!email || !validateEmail(email)) {
        logger.info("addProfile. Invalid email");
        status = 0;
        msg = "Invalid parameters";
    }

    var manager = req.params.manager;
    var country = req.params.country;
    var officePhone = req.params.officePhone;
    var mobilePhone = req.params.mobilePhone;
    var password = req.params.password;

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

        addProfileToDB(res, first, last, email, manager, country, officePhone, mobilePhone, domain,password,req.params);

    });

}

function validateEmail(email) {
    // http://stackoverflow.com/a/46181/11236
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (email.length > EMAIL_SIZE) {
        return false;
    }
    return re.test(email);
}

function addProfileToDB(res, first, last, email, manager, country, officePhone, mobilePhone, domain,password,params) {
    var errorMsg = "Failed to add profile";
	email = email.toLowerCase();

    // check if profile exists in db
    Common.db.User.findAll({
        attributes : ['email'],
        where : {
            email : email
        },
    }).complete(function(err, results) {

        if (!!err) {
            returnInternalError(err, res);
            return;

            // if not exists, create one
        }

        if (!results || results == "") {

            let passwordHash = '';
            let salt = '';
            if (password) {
                salt = setPasscode.generateUserSalt(email);
                passwordHash = setPasscode.hashPassword(password,salt);
            }
            Common.db.User.create({
                email : email,
                username : email,
                signature : '',
                firstname : first,
                orgpasswordcache : '',
                serverurl : '',
                jobtitle : '',
                orguser : params.orguser || '',
                isactive : 1,
                isadmin : 0,
                manager : manager,
                country : country,
                officephone : officePhone,
                mobilephone : mobilePhone,
                passcode : passwordHash,
                passcodeupdate: new Date(),
                passcodetypechange: 0,
                passcodesalt: salt,
                orgemail : params.orgemail || '',
                orgdomain : domain,
                lastname : last,
                authtype : 0,
                orgpassword : '',
                orgkey : '',
                securessl : '',
                loginattempts : 0,
            }).then(function(results) {
                userUtils.postNewUserProcedure(email, domain, logger, function(err) {
                    User.createUserApplicationNotif(email, domain);
                    res.send({
                        status : '1',
                        message : "The profile was added successfully"
                    });
                });


            }).catch(function(err) {
                logger.info("error on insert users to db: " + err);
                res.send({
                    status : '0',
                    message : errorMsg
                });
            });

        } else {
            logger.info("User already exist");
            res.send({
                status : '2',
                message : errorMsg
            });
            return;
        }

    });

}

var AddProfile = {
    get : addProfile
};

module.exports = AddProfile;
