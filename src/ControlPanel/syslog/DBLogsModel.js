"use strict";

var Sequelize = require('sequelize');
var Common = require('../../common.js');
var logger = Common.getLogger(__filename);

function initSequelize(dbname, user, password, host, port, callback) {

    // connect to mySQL
    var sequelize = new Sequelize(dbname, user, password, {
        host : host,
        dialect : "mysql",
        port : port,
        logging : Common.sequelizeLogs,
        pool : {
            maxConnections : Common.dbMaxConnections,
            maxIdleTime : Common.dbMaxIdleTime
        }
    });

    var db = {};

    // define Version Object
    db.Log = sequelize.define('Logs', {
        ID : {
            type : Sequelize.INTEGER,
            primaryKey : true
        },
        Time : Sequelize.DATE,
        Facility: Sequelize.INTEGER,
        LogLevel: Sequelize.INTEGER,
        ServerName: Sequelize.STRING,
        Message: Sequelize.STRING,
        Device: Sequelize.STRING,
        LoggerID: Sequelize.STRING,
        PlatfromID: Sequelize.INTEGER,
        DataCenter: Sequelize.STRING,
        User: Sequelize.STRING,
        MessageType: Sequelize.STRING,
        PID: Sequelize.INTEGER,
        AppID: Sequelize.INTEGER,
        ComponentType: Sequelize.STRING
    }, {
        timestamps : false
    });

    // authentication to mySQL
    sequelize.authenticate().then(function(err) {
        console.log('Connection to logs mySQL has been established successfully.');
        callback(null, db, sequelize);
    }, function(err) {
        console.log('Unable to connect to mySQL database:', err);
        callback('Unable to connect to mySQL database');
    });


}


module.exports = {
    initSequelize : initSequelize
};

