"use strict"

const colors = require('colors/safe');
const NuboTables = require('./upgradeNuboTables.js');
var Common;


//check if I am root
/*var user = process.env.USER;
if (user !== 'root') {
    console.error(colors.red("The script must be executed as superuser"));
    process.exit(1);
}*/

NuboTables.upgradeTables(function(err) {
        if (err) {
            process.exit(1);
        }

        process.exit(0);

    });

/*Common = require('./common.js');
Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;
    NuboTables.upgradeTables(function(err) {
        if (err) {
            process.exit(1);
        }

        process.exit(0);

    });
};*/




