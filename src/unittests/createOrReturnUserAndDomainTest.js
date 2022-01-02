"use strict";

var Common = require('../common.js');
var userUtils = require('../userUtils.js');
var testUtils = require('./testUtils.js');
var emailArr = [];
var isFinished = false;
var reqIndex = 0;
var resIndex = 0;
var failedCount = 0;
var succeedCount = 0;
var injectedCount = 0;

Common.loadCallback = function(err) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    emailArr = emailArr.concat(testUtils.emailStrings);
    emailArr = emailArr.concat(testUtils.specialCharacters);

    emailArr.forEach(function(email) {
        reqIndex++;
        var req = {};
        req.params = {
            email:email
        }
        userUtils.createOrReturnUserAndDomainRestApi(req, resTest, null);
    });
    isFinished = true;
    if (isFinished && resIndex == reqIndex) {
        checkResult();
    }

};

var resTest = {
    send: function(obj) {

        resIndex++;
        if (obj.status  == 1) {
            succeedCount++;
        } else if (obj.status  == 0 && obj.message == "Invalid or missing params") {
            failedCount++;
        } else {
            injectedCount++;
        }
        if (isFinished && resIndex == reqIndex) {
            checkResult();
        }
    }
}

function checkResult() {
    console.log("#################################################");
    console.log("createOrReturnUserAndDomainTest: failed " + failedCount + " times");
    console.log("createOrReturnUserAndDomainTest: succeed " + succeedCount + " times");
    console.log("createOrReturnUserAndDomainTest: injected " + injectedCount + " times");
    console.log("#################################################");
    Common.quit();

}


