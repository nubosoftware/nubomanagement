"use strict";

var _ = require("underscore");
var async = require("async");


function main() {

    var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage("Usage: node --use_strict $0 --vm <vmName> -a <action>")
    .demandOption(["a","vm"])
    .alias("a", "action")
    .describe("a", "power action: poweron | poweroff")
    .describe("vm", "name of azure virtual machine")
    .argv;


    var ComputeManagementClient;
    var Config;
    var vmName = argv.vm;
    var action = argv.action;

    async.waterfall(
        [
            function(callback) {
                var fs = require('fs');
                fs.readFile('Settings.json', function(err, data) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    var rawSettings = data.toString().replace(/[\n|\t]/g, '');
                    try {
                        Config = JSON.parse(rawSettings);
                    } catch (err) {
                        callback(err + ", while parsing Settings.json");
                        return;
                    }
                    callback(null);
                });
            },
            function(callback) {
                const Azure = require('azure');
                const MsRest = require('azure/node_modules/ms-rest-azure');
                MsRest.loginWithServicePrincipalSecret(
                    Config.azureParams.clientId,
                    Config.azureParams.secret,
                    Config.azureParams.domainId,
                    function(err, credentials) {
                        if (err) {
                            console.log("platform_azure_static.js::start_platform: loginWithServicePrincipalSecret failed with error: ", err);
                            callback(err);
                        } else {
                            ComputeManagementClient = Azure.createComputeManagementClient(credentials, Config.azureParams.subscriptionId);
                            callback(null);
                        }
                    }
                );
            },
            function(callback) {
                ComputeManagementClient.virtualMachines.get(Config.azureParams.resourceGroup, vmName, {expand: "instanceView"}, function(err, result) {
                    if(err) {
                        console.log("platform_azure_static.js::start_platform: ComputeManagementClient.virtualMachines.get failed with err: ", err);
                        callback(err);
                    } else if(!result || !result.instanceView || !result.instanceView.statuses) {
                        console.log("platform_azure_static.js::start_platform: ComputeManagementClient.virtualMachines.get failed with invalid result");
                        callback("invalid result");
                    } else {
                        var powerState = _.find(result.instanceView.statuses, function(item) {return item.code.indexOf("PowerState/") === 0;});
                        if(powerState) {
                            callback(null, powerState.code);
                        } else {
                            callback("missed power state");
                        }
                    }
                });
            },
            function(powerState, callback) {
                var callbackFunc = function(err, result) {
                    if(err) {
                        console.log(action + " failed with err: ", err);
                        callback(err);
                    } else if(result.status === "Succeeded") {
                        callback(null);
                    } else {
                        console.log(action + " failed with invalid result");
                        callback("invalid result");
                    }
                };
                console.log("vmName: " + vmName + ", action: " + action + ", powerState: " + powerState);
                if(action === "poweron") {
                    if(powerState === "PowerState/running") {
                        return callback("Already run");
                    } else {
                        ComputeManagementClient.virtualMachines.start(Config.azureParams.resourceGroup, vmName, callbackFunc);
                    }
                } else if(action === "poweroff") {
                    if((powerState === "PowerState/deallocated") || (powerState === "PowerState/stopped")) {
                        console.log("VM " + vmName + " already disabled");
                        return callback(null);
                    } else {
                        ComputeManagementClient.virtualMachines.powerOff(Config.azureParams.resourceGroup, vmName, callbackFunc);
                    }
                } else {
                    return callback("WTF!!!");
                }
            },
        ], function(err) {
            if(err) {
                console.log("Failed with err: " + err);
                process.exitCode = 10;
            } else {
                console.log("OK");
            }
        }
    );
}

main();


