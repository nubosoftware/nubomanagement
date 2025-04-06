"use strict";
const Common = require('./common.js');
const logger = Common.getLogger(__filename);
const Login = require('./login.js');
const jwt = require('jsonwebtoken');
const Plugin = require('./plugin.js');
const { s } = require('accesslog/lib/tokens.js');



/**
 * Load a login object from the redis
 * @param {*} loginToken
 * @returns
 */
function getLogin(loginToken) {
    return new Promise(function(resolve, reject) {
        new Login(loginToken, function(err, login) {
            if (err) {
                reject(err);
                return;
            }
            if (!login) {
                reject(new Error('Login token not found'));
                return;
            }
            resolve(login);
        });
    });
}

/**
 * Check if the authentification is valid.
 * Extract the loginToken and the JWT token from the authorization header
 * Load the login object from the redis
 * and check if the JWT token is valid.
 * @param {*} req
 * @param {*} res
 * @returns
 */
async function checkAuth(req,res) {
    // first check if the authentification is valid
    try {
        let auth = req.headers['authorization'];
        if (!auth) {
            throw new Error("No authorization header");
        }
        var arr = auth.split(" ");
        if (Array.isArray(arr) && arr.length > 1) {
            auth = arr[arr.length-1];
        }
        logger.info(`authorization: "${auth}"`);

        const authArr = auth.split(":");
        if (authArr.length !== 2) {
            throw new Error("Invalid authorization header");
        }
        const loginToken = authArr[0];
        const jwtToken = authArr[1];
        if (!loginToken || !jwtToken) {
            throw new Error("Invalid authorization header");
        }
        const login = await getLogin(loginToken);
        const publicKey = login.loginParams.public_key;
        if (!publicKey || publicKey === "null") {
            //throw new Error("No public key found");
            logger.info(`No public key found for loginToken: ${loginToken}`);
            return login;
        }
        logger.info(`checkAuth: loginToken: ${loginToken} jwtToken: ${jwtToken}, publicKey: ${publicKey}`);
        const decoded = jwt.verify(jwtToken, publicKey);
        if (!decoded) {
            throw new Error("Invalid JWT");
        }
        let decodedLoginToken = decoded.loginToken;
        if (!decodedLoginToken) {
            decodedLoginToken = decoded.sub;
        }
        if (decodedLoginToken !== loginToken) {
            throw new Error("Invalid loginToken in JWT");
        }
        return login;


    } catch (err) {
        logger.error(`checkAuth error: ${err}`,err);
        res.send(403, "403 Forbidden\n",{
            "Content-Type": "text/plain"
        });
        return null;
    }
}

/**
 * Handle API calls from the clients
 * @param {*} req
 * @param {*} res
 */
var apiAccess = function (req, res,next) {
    const objectType = req.params.objectType;
    const arg1 = req.params.arg1;
    const arg2 = req.params.arg2;
    const arg3 = req.params.arg3;

    // logger.info("Client.apiAccess: objectType: " + objectType + " arg1: " + arg1 + " arg2: " + arg2 + " arg3: " + arg3);

    if (objectType === "auth") {
        if (arg1 === "activate") {
            require('./activateDevice.js').func(req, res);
            return;
        } else if (arg1 === "validate") {
            require('./validate').func(req, res);
            return;
        }
    }
    if (Common.pluginsEnabled) {
        const handled = Plugin.callFirstPluginFunction("handleClientApiRequestNotAuthenticated", objectType, arg1, arg2, arg3, req, res);
        if (handled) {
            console.log("handled by plugin!!!!");
            return;
        }
    }

    // check if the authentification is valid
    checkAuth(req, res).then((login) => {

        // const login = await checkAuth(req,res);
        if (!login) {
            // invalid authentification. checkAuth already sent the error message
            return;
        }
        if (objectType === "checkAuth") {
            // if we pass checkAuth, the authentication is valid
            res.send({
                status: Common.STATUS_OK,
                message: "Valid authentication"
            });
            return;
        } else if (objectType === "password") {
            // password management
            if (arg1 === "check") {
                require('./checkPasscode').func(req, res, login);
                return;
            } else if (arg1 === "set") {
                require('./setPasscode').func(req, res, login);
                return;
            } else if (arg1 === "reset") {
                require('./resetPasscode').func(req, res, login);
                return;
            }
        } else if (objectType === "session") {
            // session management
            if (arg1 === "list" && req.method === "POST") {
                // list possible sessions
                require('./SessionController').list(req, res, login);
                return;
            } else if (arg1 === "start" && req.method === "POST") {
                // start a new session
                require('./SessionController').startSessionFromClient(req, res, login);
                return;
            } else if (arg1 == "logout" && req.method === "POST") {
                // close a session
                require('./SessionController').logoutUserImp(req, res, login);
                return;
            }
        }

        if (Common.pluginsEnabled) {
            const handled = Plugin.callFirstPluginFunction("handleClientApiRequest", objectType, arg1, arg2, arg3, login, req, res);
            if (handled) {
                return;
            }
        }



        logger.info("apiAccess. Unhandled request. objectType: " + objectType + " arg1: " + arg1 + " arg2: " + arg2 + " arg3: " + arg3);
        res.send({
            status: Common.STATUS_ERROR,
            message: "Invalid request"
        });
        res.end();
        return;
    }).catch((err) => {
        logger.error(`apiAccess error: ${err}`, err);
        res.send(403, "403 Forbidden\n", {
            "Content-Type": "text/plain"
        });
        return;
    });

    // res.send({
    //     status : Common.STATUS_OK,
    //     message : "Test",
    //     objectType : objectType,
    //     arg1 : arg1,
    //     arg2 : arg2,
    //     arg3 : arg3
    // });
    // res.end();
}

module.exports = {
    apiAccess
}