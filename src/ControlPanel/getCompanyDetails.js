"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function getCompanyDetails(req, res, next) {

    // https://login.nubosoftware.com/addProfile?session=[]&first=[first]&last=[last]&email=[email]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

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

        res.send({
            status : status,
            message : msg,
            domain : domain
        });

    });

}

var GetCompanyDetails = {
    get : getCompanyDetails
};

module.exports = GetCompanyDetails;
