var fs = require('fs');
var async = require('async');

function parseParameters(mode, data, parameters, func) {
    var parsedData = JSON.parse(JSON.stringify(data));

    for (var k in parameters) {

        // paramter of type object
        if (typeof parameters[k] === "object") {
            if (typeof parsedData[k] === "object" && parsedData[k] !== null) {
                if (typeof parsedData[k] !== typeof parameters[k])
                    throw ("type of parameter " + k + " not same in data and paramters");

                parsedData[k] = parseParameters(mode, parsedData[k], parameters[k], func);
            }

            // paramter of type list
        } else if (parameters[k] == "*") {
            if (parsedData[k] && typeof parsedData[k] !== "object")
                throw ("parameter " + k + " is not an object");

            for (var i in parsedData[k]) {

                if (typeof parsedData[k][i] !== "string")
                    throw ("value of \"" + parsedData[k][i] + "\" should be type of string");

                if (mode === 'dec') {
                    if (parsedData[k][i].indexOf("enc:") === 0) {
                        parsedData[k][i] = func(parsedData[k][i]);
                    }

                } else if (mode === 'enc') {
                    if (parsedData[k][i].indexOf("enc:") !== 0) {
                        parsedData[k][i] = func(parsedData[k][i]);
                    }
                }
            }

            // paramter of type string
        } else {
            if (parsedData[k]) {
                if (typeof parsedData[k] !== "string") {
                    throw ("paramter \"" + k + ": " + parsedData[k] + "\" should be type of string");
                }

                if (mode === 'dec') {
                    if (parsedData[k].indexOf("enc:") === 0) {
                        parsedData[k] = func(parsedData[k]);
                    }

                } else if (mode === 'enc') {
                    if (parsedData[k].indexOf("enc:") !== 0) {
                        parsedData[k] = func(parsedData[k]);
                    }
                }
            }
        }
    }

    return parsedData;
}

module.exports = {
    parseParameters: parseParameters
};