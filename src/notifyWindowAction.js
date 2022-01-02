"use strict";

var async = require('async');

var Common = require('./common.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var Notifications = require('./Notifications.js');

function get(req, res, next) {
    var logger = new ThreadedLogger(Common.getLogger(__filename));
    logger.user(req.params.username);
    //console.log("notifyWindowAction query: " + JSON.stringify(req.params));

    var opts = {
        urlparams: req.params,
        logger: logger,
        session: req.nubodata.session,
    };

    notifyWindowActionInternal(opts, logger, function(err, obj) {
        if (err) {
            res.send({
                status: 0,
                message: err
            });
            logger.error("notifyWindowAction err = " + err);
        } else {
            res.send({
                status: 1,
                message: "Success"
            });
            logger.info("notifyWindowAction done");
        }
    });
}

function notifyWindowActionInternal(opts, logger, callback) {
    async.series(
        [
            function(callback) {
                if(Number(opts.session.params.suspend) == 0) {
                    callback("ignore connected user");
                } else {
                    callback(null);
                }
            },
            function(callback) {
                var activationkey = opts.session.params.activation;
                var text;
                var packageID = opts.urlparams.intent.split("/")[0];
                if(opts.urlparams.action === "created") {
                    text = "RING";
                } else if(opts.urlparams.action === "destroyed") {
                    text = "CANCEL";
                } else {
                    return callback("invalid action");
                }
                //packageID
                if ("com.nubo.sip" !== packageID) {
                    Notifications.sendNotificationByActivation(activationkey, text, "", "", 5, packageID);
                } else {
                    logger.info("notifyWindowAction. Ignore messages from com.nubo.sip");
                }
                callback(null);
            },
        ], function(err) {
            callback(null);
        }
    );
}

module.exports = {
    get: get
}
