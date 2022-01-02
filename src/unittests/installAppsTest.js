"use strict";

var Common = require('../common.js');
var installApps = require('../ControlPanel/installApps.js');
var settings = require('../settings.js');
var testUtils = require('./testUtils.js');
var isFinished = false;
var reqIndex = 0;
var resIndex = 0;
var failedCount = 0;
var succeedCount = 0;
var injectedCount = 0;
var adminEmailTest = "unittest@nubosoftware.com";
var passcodeTest = "123456";
var regidTest = "123456789";
var groupNameTest = "All";
var loginToken;
var sessionid;
var packageNameTest = "com.android.browser";


Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    var req = {};
    req.params = {
        email:adminEmailTest
    }
    testUtils.createAdminAndStartSession(req, createAdminAndStartSessionRes, null, adminEmailTest, regidTest, passcodeTest);

};

var createAdminAndStartSessionRes = {
    send: function(obj) {
        if (obj.status == 1) {
            startInstallAppsTest(obj);
        } else {
            console.log("***** ERROR ***** installAppsTest:createAdminAndStartSessionRes" )
            checkResult(obj);
        }
    }
}

function startInstallAppsTest(obj){
    var emailsArr = [];
    emailsArr = emailsArr.concat(testUtils.emailStrings);
    emailsArr = emailsArr.concat(testUtils.pathStrings);
    emailsArr = emailsArr.concat(testUtils.specialCharacters);

    var packageNamesArr = [];
    packageNamesArr = packageNamesArr.concat(testUtils.emailStrings);
    packageNamesArr = packageNamesArr.concat(testUtils.pathStrings);
    packageNamesArr = packageNamesArr.concat(testUtils.specialCharacters);

    var groupsArr = [];
    groupsArr = groupsArr.concat(testUtils.emailStrings);
    groupsArr = groupsArr.concat(testUtils.pathStrings);
    groupsArr = groupsArr.concat(testUtils.specialCharacters);


    var addomainsArr = [];
    addomainsArr = addomainsArr.concat(testUtils.emailStrings);
    addomainsArr = addomainsArr.concat(testUtils.pathStrings);
    addomainsArr = addomainsArr.concat(testUtils.specialCharacters);


    //Email test
    emailsArr.forEach(function(email) {
        reqIndex++;
        var req = {};
        req.params = {
            email : email,
            packageName : packageNameTest,
            groupName : groupNameTest,
            adDomain : ""
        }
        req.body = {
            secret : settings.getMainSecretKey(),
            session: obj.sessionid
        };
        req.connection = {
            remoteAddress: "localhost"
        };
        installApps.get(req, installAppsRes, null);
    });
    //packageName test
    packageNamesArr.forEach(function(packageName) {
        reqIndex++;
        var req = {};
        req.params = {
            email : adminEmailTest,
            packageName : packageName,
            groupName : groupNameTest,
            adDomain : ""
        }
        req.body = {
            secret : settings.getMainSecretKey(),
            session: obj.sessionid
        };
        req.connection = {
            remoteAddress: "localhost"
        };
        installApps.get(req, installAppsRes, null);
    });

    //groupName test
    groupsArr.forEach(function(group) {
        
        reqIndex++;
        var req = {};
        req.params = {
            email : adminEmailTest,
            packageName : groupNameTest,
            groupName : group,
            adDomain : ""
        }
        req.body = {
            secret : settings.getMainSecretKey(),
            session: obj.sessionid
        };
        req.connection = {
            remoteAddress: "localhost"
        };
        installApps.get(req, installAppsRes, null);
         
    });
    //adDomain test
    addomainsArr.forEach(function(adDomain) {
        reqIndex++;
        var req = {};
        req.params = {
            email : adminEmailTest,
            packageName : packageNameTest,
            groupName : groupNameTest,
            adDomain : adDomain
        }
        req.body = {
            secret : settings.getMainSecretKey(),
            session: obj.sessionid
        };
        req.connection = {
            remoteAddress: "localhost"
        };
        installApps.get(req, installAppsRes, null);
    });
    isFinished = true;
    if (isFinished && resIndex == reqIndex) {
        checkResult();
    }
}

var installAppsRes = {
    send: function(obj) {
        resIndex++;
        if (obj.status== 1) {
            succeedCount++;
        } else if (obj.status == 0) {
            failedCount++;
        } else {
            injectedCount++;
        }
        if (isFinished && resIndex == reqIndex) {
            checkResult();
        }
    }
}


function checkResult(msg) {
    if (msg){
        console.log("####################################################################");
        console.log("####################################################################");
        console.log("####################################################################");
        console.log("installAppsTest failed!!! ", msg);
        console.log("####################################################################");
        console.log("####################################################################");
        console.log("####################################################################");

    } else {
        console.log("##################################");
        console.log("installAppsTest: failed " + failedCount + " times");
        console.log("installAppsTest: succeed " + succeedCount + " times");
        console.log("installAppsTest: injected " + injectedCount + " times");
        console.log("##################################");
    }
    Common.quit();

}



