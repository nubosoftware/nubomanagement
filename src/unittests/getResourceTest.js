"use strict";

var Common = require('../common.js');
var getResource = require('../getResource.js');
var testUtils = require('./testUtils.js');

var packageNameArr = [];
var fileNameArr = [];
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

    packageNameArr = packageNameArr.concat(testUtils.pathStrings);
    packageNameArr = packageNameArr.concat(testUtils.specialCharacters);
    fileNameArr = fileNameArr.concat(testUtils.pathStrings);
    fileNameArr = fileNameArr.concat(testUtils.specialCharacters);
    packageNameArr.forEach(function(packageName) {
        fileNameArr.forEach(function(fileName) {
            reqIndex++;
            var req = {};
            req.params = {
                packageName:packageName,
                fileName:fileName
            }
            getResource.getResource(req, resTest, null);
        });
    });
    isFinished = true;
    if (isFinished && resIndex == reqIndex) {
        checkResult();
    }
};

var resTest = {
    send: function(obj) {
        resIndex++;
        if (obj.status  == 0) {
            succeedCount++;
        } else if (obj.status  == 1) {
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
    console.log("##################################");
    console.log("getResourceTest: failed " + failedCount + " times");
    console.log("getResourceTest: succeed " + succeedCount + " times");
    console.log("getResourceTest: injected " + injectedCount + " times");
    console.log("##################################");
    Common.quit();

}


