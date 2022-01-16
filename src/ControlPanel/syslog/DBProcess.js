"use strict";

var async = require('async');
var _ = require('underscore');
var Common = require('../../common.js');
var DBModule = require('./DBLogsModel.js');
var logger = Common.getLogger(__filename);
const { Op, QueryTypes } = require('sequelize');

var DBObj;
var Sequelize;


//init sequelize connection
var initDBObj = function(callback) {
    let dbConf;
    if (Common.syslogDb && Common.syslogDb.user) {
        dbConf = Common.syslogDb;
    } else {     
        dbConf = Common.sysConf.dbConf;
    }
    DBModule.initSequelize(
            "nuboLogs",
            (dbConf.user) || Common.dbUser,
            (dbConf.password) || Common.dbPassword,
            (dbConf.host) || Common.dbHost,
            (dbConf.port) || Common.dbPort,
            function(err, obj, obj2) {
                console.log(" initDBObj finished: ");
                if(err) {
                    callback("Cannot access to database");
                } else {
                    DBObj = obj;
                    Sequelize = obj2;
                    callback(null, obj, obj2);
                }
    });
};

// convert filter object to object options described in http://docs.sequelizejs.com/en/latest/api/model/#findall
var getOptions = function(_filter) {
    if (_filter.where) {    //_filter is already options
        return _filter;
    }
    var options = {
        where: {
            Time: {}
        }
    };

    options.where.Time = {
        [Op.gt] :_filter.start_time || new Date(new Date().getTime() - 1*24*60*60*1000)
    };

    if(_filter.end_time) {
        options.where.Time = {
            [Op.gt] :_filter.start_time || new Date(new Date().getTime() - 1*24*60*60*1000),
            [Op.lt] :  _filter.end_time
        };
    }
    if(_filter.user) options.where.User = _filter.user;

    if(_filter.level) options.where.LogLevel = _filter.level;
    if(_filter.limit) options.limit = parseInt(_filter.limit);
    if(_filter.order) options.order = _filter.order;
    if(_filter.offset) options.offset = parseInt(_filter.offset);
    if(_filter.ComponentType) options.where.ComponentType = _filter.ComponentType;
    if(_filter.MessageType) options.where.MessageType = _filter.MessageType;
    if(_filter.ServerName) options.where.ServerName = _filter.ServerName;
    if(_filter.search) options.where.Message = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Message')), 'LIKE', '%' + _filter.search + '%');
    //console.log(" filter: ", _filter);
    //console.log(" options: ", options);
    return options;
};


var getFiltersFromLogs = function(callback) {
    let ComponentType;
    let ServerName;
    logger.info("getFiltersFromLogs");
    async.series([
        (callback) => {
            if(DBObj) {
                callback(null);
            } else {
                initDBObj(callback);
            }
        },
        (callback) => {
            let query = 'select ComponentType, count(*) from Logs where Time > :start_time  group by ComponentType order by ComponentType;';
            let queryParams = {start_time:  new Date(new Date().getTime() - 5*24*60*60*1000)};
            Sequelize.query(query , { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {
                ComponentType = results;
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
        (callback) => {
            let query = 'select ServerName, count(*) from Logs where Time > :start_time  group by ServerName order by ServerName;';
            let queryParams = {start_time:  new Date(new Date().getTime() - 5*24*60*60*1000)};
            Sequelize.query(query , { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {
                ServerName = results;
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        },
    ],(err) => {
        logger.info("getFiltersFromLogs. callback");
        callback(err,{
            ComponentType,
            ServerName
        });
    });

}

// Find all record in logs table that constrain to filter
var getLogs = function(_filter, callback) {
    var options = getOptions(_filter);
    if(typeof (_filter) === "function") callback = _filter;

    //logger.error("getLogs. options: "+JSON.stringify(options,null,2));
    DBObj.Log.findAndCountAll(options).then(function(results) {
        //logger.info("getLogs. results: "+results.length);
            var res = {};
            res.rows = _.map(results.rows, function(item) { return item.dataValues;});
            res.count = results.count;
            callback(null, res);
    }).catch(err => {

        callback(err);
    });
};

// Wripper of getLogs, init sequelize in case of DBObj is not defined
var getLogsInitIfNecessary = function(_filter, callback) {
    var logsArr;
    if(typeof (_filter) === "function") callback = _filter;
    async.series([
            function(callback) {
                if(DBObj) {
                    callback(null);
                } else {
                    initDBObj(callback);
                }
            },
            function(callback) {
                getLogs(_filter, function(err, results) {
                    logsArr = results;
                    callback(err);
                });
            }
        ], function(err) {
            //console.log("res: ", res);
            callback(err, logsArr);
        }
    );
};

var getSequelizeInitIfNecessary = function(callback) {
    async.series([
            function(callback) {
                if(DBObj) {
                    callback(null);
                } else {
                    initDBObj(callback);
                }
            }
        ], function(err) {
             callback(err, Sequelize);
        }
    );
};

module.exports = {
    init: initDBObj,
    getLogs: getLogsInitIfNecessary,
    getSequelize: getSequelizeInitIfNecessary,
    getFiltersFromLogs
};

