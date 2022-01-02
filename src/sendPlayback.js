"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
var util = require('util');
var Login = require('./login.js');
var ThreadedLogger = require('./ThreadedLogger.js');
var fs = require('fs');
var commonUtils = require('./commonUtils.js');

///var recordingFolder = "/srv/nfs4/recordings";



var sendPlayback = function (client, clientAddr, resourceURL) {

    var logger = new ThreadedLogger(Common.getLogger(__filename));
    var log;
    log = function (msg) {
        logger.info(' ' + clientAddr + ': ' + msg);
    };
    var recordingFolder = Common.recordingFolder;
    if (!recordingFolder) {
        logger.error("Common.recordingFolder not found");
        client.close();
        return;
    }
    log('WebSocket connection');
    log('Version ' + client.protocolVersion + ', subprotocol: ' + client.protocol);

    //read and validate params
    var loginToken = resourceURL.query.loginToken;
    var fileName = resourceURL.query.fileName;


    new Login(loginToken, function (err, login) {
        if (err) {
            logger.error("startSession: " + err);
            client.close();
            return;
        }

        if (!login.isValidLogin()) {
            logger.error("startSession user not loggedin");
            client.close();
            return;
        }

        logger.user(login.getEmail());
        logger.info("sendPlayback for user " + login.getEmail() + ", file name: " + fileName);
        try {
            // open file stream
            var fs = require('fs');
            var __filename = commonUtils.buildPath(recordingFolder, fileName);
            var source = fs.createReadStream(__filename);

            source.on('readable', function () {
                var buf;
                while (buf = source.read()) {
                    //console.log('Read from the file:', buf);
                    client.sendBytes(buf);
                }

            });
            source.once('end', function () {
                console.log('stream ended');
                client.close();
            });
            source.once('error', function (err) {
                logger.error("Error in read recording file: " + err.message);
                client.close();
            });
        }
        catch (err) {
            logger.error("Exception in read recording file: " + err.message);
            client.close();
            return;
        }
    });
};

module.exports = {
    sendPlayback: sendPlayback
};