var http = require('./http.js');
var querystring = require('querystring');
var Common = require('./common.js');
var url = require('url');
var logger = Common.getLogger(__filename);
var _ = require('underscore');

function getOptions() {
    var options = {};
    _.extend(options, Common.publicServerCredentials.options);
    return options;
}

function sendActivationLink(emailtoken, callback) {
    var options = getOptions();
    options.path = '/activationLink?token=' + emailtoken;

    http.doGetRequest(options, function(err, resData) {
        if (err) {
            callback(err);
            return;
        }

        var resObjData;
        try {
            resObjData = JSON.parse(resData);
        } catch (e) {
            callback(e);
            return;
        }

        if (resObjData.status != 0) {
            callback(resObjData.message);
        } else {
            callback(null, resObjData);
        }

        return;
    });
}

module.exports = {
    sendActivationLink: sendActivationLink
}