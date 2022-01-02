"use strict";

var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var sessionModule = require('../session.js');
var Session = sessionModule.Session;
var setting = require('../settings.js');
var util = require('util');
var async = require('async');
const { QueryTypes } = require('sequelize');

function loadAdminParamsFromSession(req, res, callback) {
    setting.loadAdminParamsFromSession(req, res, callback);
}

function getAllApps(req, res, next) {

    // https://login.nubosoftware.com/getAllApps?session=[]

    res.contentType = 'json';
    var status = 1;
    var msg = "";

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

        getAllAppsFromDB(res, domain, function(err, obj) {
            if (err) {
                res.send({
                    status : '0',
                    message : err
                });
                return;
            }

            var json = {
                status : '1',
                message : 'The request was fulfilled',
                apps : obj
            };
            res.send(json);
            return;
        });

    });

}

function getAllAppsFromDB(res, domain, callback) {

    var apps = [];

    var query = 'select a1.appname, a1.packagename, a1.versionname, a1.versioncode, a1.description, a1.imageurl, a1.price, a1.summary, a1.categories, a2.count from apps as a1'
        + ' LEFT JOIN (select packagename, count(packagename) as count from user_apps group by packagename) as a2'
        + ' ON(a1.packagename=a2.packagename)';

    var queryWhereClause = ' WHERE a1.maindomain= :domain';
    var queryParams = {domain:domain};

    Common.sequelize.query(query + queryWhereClause, { replacements: queryParams, type: QueryTypes.SELECT}).then(function(results) {

       results.forEach(function(row) {

           // get all values of current row
           var packageName = row.packagename != null ? row.packagename : '';
           var versionName = row.versionname != null ? row.versionname : '';
           var versionCode = row.versioncode != null ? row.versioncode : '';
           var appName = row.appname != null ? row.appname : '';
           var imageUrl = row.imageurl != null ? row.imageurl : '';
           var price = row.price != null ? row.price : '';
           var description = row.description != null ? row.description : '';
           var count = row.count != null ? row.count : '';
           var summary = row.summary != null ? row.summary : '';
           var categories = row.categories != null ? row.categories : '';

           if (!imageUrl || imageUrl == "") {
                if (Common.appstore && Common.appstore.enable === true) {
                    if (Common.appstore.extURL) {
                        imageUrl = Common.appstore.extURL;
                    } else {
                        imageUrl = Common.appstore.url;
                    }
                } else {
                    imageUrl = "";
                }
                imageUrl += `/${domain}/repo/icons/${packageName}.${versionCode}.png`
            }

           var jsonApp = {
               packageName : packageName,
               versionName : versionName,
               versionCode : versionCode,
               appName : appName,
               imageUrl : imageUrl,
               price : price,
               description : description,
               downloadCounter : count,
               summary: summary,
               categories: categories
           };

       apps.push(jsonApp);
       });

       callback(null, apps);
       return;

    }).catch(function(err) {
       logger.info('Cant select apps: ' + err);
       callback(err, null);
       return;
    });
}

function getAppDownloadsCount(res, packageName, domain, callback) {

    Common.db.UserApps.findAndCountAll({
        where : {
            packagename : packageName,
            maindomain : domain
        },
    }).then(function(results) {

        callback(null, results.count);
        return;
    });

}

var GetAllApps = {
    get : getAllApps,
    getAppDownloadsCount : getAppDownloadsCount

};

module.exports = GetAllApps;
