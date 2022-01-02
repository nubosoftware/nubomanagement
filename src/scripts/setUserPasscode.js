
var Common = require('../common.js');
var logger = Common.getLogger(__filename);
var yargs = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 -e email -p newpasscode ')
    .demandOption(['e','p']);
var crypto = require('crypto');
var setPasscode = require('../setPasscode.js');
var myArgs = yargs.argv;



var genRandomString = function(length){
    return crypto.randomBytes(Math.ceil(length/2))
            .toString('hex') /** convert to hexadecimal format */
            .slice(0,length);   /** return required number of characters */
};

var generateUserSalt = function(username) {
    if (Common.savedPasscodeHistory > 0) {
        // we cannot use random salt ebcause we save passcode history - return user name as salt.
        return username;
    } else {
        return genRandomString(16);
    }
};


Common.loadCallback = function(err, firstTime) {
    if (err) {
        console.log("Error: "+err);
        Common.quit();
        return;
    }
    if(!firstTime) return;

    let email = myArgs.e;
    let decryptedPassword = myArgs.p;
    if (!email | !decryptedPassword) {
        myArgs.showHelp();
        Common.quit();
        return;
    }

    var salt = generateUserSalt(email);
    var passwordHash = setPasscode.hashPassword(decryptedPassword, salt);
    Common.db.User.update({
        passcodeupdate: new Date(),
        passcode: passwordHash,
        passcodetypechange: 0,
        passcodesalt: salt
    }, {
            where: {
                email: email
            }
        }).then(function () {
            logger.info("Passcode changed!");
            Common.quit();
        }).catch(function (err) {
            logger.error("Error: "+err);
            Common.quit();
            console.err(err);
        });
};