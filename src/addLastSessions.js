"use strict";

var Common = require('./common.js');
var logger = Common.getLogger(__filename);
const { QueryTypes } = require('sequelize');

function addLastSessions(callback) {

    var getCurrentTime = new Date().getMinutes();
    var query = 'select count(*) AS count, maindomain from user_devices';

        var queryWhereClause = " WHERE platform is NOT NULL group by maindomain";
        var queryParams = {};

        Common.sequelize.query(query + queryWhereClause, {type: QueryTypes.SELECT}).then(function(results) {

            if (results.length === 0) {
                callback(null);
                return;
            }

            results.forEach(function(row) {

                var mainDomain = row.maindomain != null ? row.maindomain : '';
                var count = row.count != null ? row.count : '';

                // insert to db every 5 minutes.
                if(getCurrentTime % 5 == 0) {
                    insertSessionsToDB(count, mainDomain);
                }
            });

            callback(null);
            return;

        }).catch(function(err) {
            callback(err);
            return;
        });
}

function insertSessionsToDB(count, domain) {

    Common.db.LastSessions.create({
        count : count,
        time : new Date(),
        maindomain : domain,
    }).then(function(results) {

    }).catch(function(err) {
        logger.info("error on insert session to db: " + err);
    });
}

var AddLastSessions = {
        addLastSessions: addLastSessions
};

module.exports = AddLastSessions;
