"use strict";

/*
 * @author Ori Sharon In this class we add a profile
 */

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function updateApkDescription(req, res, next) {

    // https://login.nubosoftware.com/checkApkStatus?session=[]&packageName=[]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

    var packageName = req.params.packageName;
    var appDescription = req.params.appDescription;

    if (!packageName || packageName == "") {
        status = 0;
        msg = "Invalid packageName";
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
                    message : err,
                });
                return;
            }
            var domain = login.loginParams.mainDomain;
        } else {
            var domain = "nubosoftware.com";
        }

        let data = {
            description: appDescription
        };
        if (req.params.appName) {
            data.appname = req.params.appName;
        }
        if (req.params.appSummary) {
            data.summary = req.params.appSummary;
        }
        if (req.params.appCategories) {
            data.categories = req.params.appCategories;
        }
        if (req.params.displayprotocol) {
            data.displayprotocol = req.params.displayprotocol;
        }

        logger.info("updateApkDescription: "+JSON.stringify(data,null,2));

        updateDescriptionInDB(data, packageName, domain, function(err) {
            if (err) {
                res.send({
                    status : '0',
                    message : "Internal error"
                });
                return;
            }
            res.send({
                status : '1',
                message : "updated description of app in db"
            });
        });
        return;
    });

}

function updateDescriptionInDB(data, packagename, domain, callback) {

    Common.db.Apps.update(data, {
        where : {
            packagename : packagename,
            maindomain : domain
        }
    }).then(function() {
        if (Common.appstore && Common.appstore.enable === true) {
            // Update app store
            if (Common.isMobile()) {
                Common.getMobile().appStore.updateRepo(domain,packagename,() => {});
            }
        }
        callback(null);

    }).catch(function(err) {
        logger.info("Internal error while updating description for APK in DB" + err);
        callback("Internal error while updating description for APK in DB");
    });

}

var UpdateApkDescription = {
    get : updateApkDescription
};

module.exports = UpdateApkDescription;
