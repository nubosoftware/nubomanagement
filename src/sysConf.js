"use strict"

const crypto = require('crypto');
const async = require('async');
const fs = require('fs');
const fsp = fs.promises;
var path = require('path');
var _ = require('underscore');

const SKEY = '/etc/.nubo/.skey';
const DOCKERKEY = '/etc/.nubo/.docker';
const SYSCONF = '/var/.nubo/.sysconf';
const ALGO = 'aes-256-cbc';
const ALGOOld = 'aes-128-cbc';
const S_PASS = "******";
const SKEY_DOCKER = "./conf/.skey";
const SYSCONF_DOCKER = "./conf/sysconf";

var skeyFile = null;
var sysconfFile = null;
var isDocker = false;
var isLoaded = false;

const redisConf = {
    host: "127.0.0.1",
    port: 6379,
    db: 0
};

var dbConf = {
    host: 'localhost',
    name: 'nubo',
    user: 'root',
    password: 'password',
    port: '3306',
    maxConnections: 10,
    maxIdleTime: 30
}

var schema = {
    properties: {
        redisConf: {
            properties: {
                host: {
                    description: 'enter redis server address:',
                    default: '127.0.0.1'
                },
                port: {
                    description: 'enter redis server port:',
                    default: 6379,
                },
                db: {
                    description: 'enter redis db',
                    default: 0
                },
                password: {
                    description: 'enter redis passowrd if exist'
                }
            }
        },
        dbConf: {
            properties: {
                host: {
                    description: 'enter db host:',
                    default: '127.0.0.1',
                },
                port: {
                    description: 'entter db port:',
                    default: 3306
                },
                name: {
                    description: 'enter db name:',
                    default: 'nubo',
                },
                user: {
                    description: 'enter db user:',
                },
                password: {
                    description: 'enter db password:',
                }
            }
        }
    }
}

function getSchema(callback) {

    loadSysConf(function(err, conf) {
        if (err) {
            return callback(err);
        }

        schema.properties.redisConf.properties.host.default = conf.redisConf.host;
        schema.properties.redisConf.properties.port.default = conf.redisConf.port;
        schema.properties.redisConf.properties.db.default = conf.redisConf.db;
        schema.properties.redisConf.properties.password.default = conf.redisConf.password ? S_PASS : "";

        schema.properties.dbConf.properties.host.default = conf.dbConf.host;
        schema.properties.dbConf.properties.port.default = conf.dbConf.port;
        schema.properties.dbConf.properties.name.default = conf.dbConf.name;
        schema.properties.dbConf.properties.user.default = conf.dbConf.user;
        schema.properties.dbConf.properties.password.default = S_PASS;

        callback(null, schema);
    });
}
let defaultSysConf = {
    "redisConf": {
        "host": "nubo-redis",
        "port": "6379",
        "db": "0",
        "password": ""
    },
    "dbConf": {
        "host": "nubo-mysql",
        "port": "3306",
        "name": "nubo",
        "user": "root",
        "password": "password"
    }
};
function loadSysConf(callback) {


    async.waterfall([
        function(callback) {
            getSkey(callback);
        },
        function(encKey, callback) {
            fs.readFile(sysconfFile, function(err, data) {
                if (err) {
                    console.log("Sysconf file not found. generate default file");
                    callback(null,defaultSysConf,encKey);
                    return;
                }

                var conf;
                try {
                    var conf = JSON.parse(data.toString());
                } catch (err) {
                    callback(err);
                    return;
                }

                callback(null, conf, encKey);
            });
        },
        function(conf, encKey, callback) {            
            conf.dbConf.password = dec(conf.dbConf.password, encKey);
            if (conf.redisConf.password) {
                conf.redisConf.password = dec(conf.redisConf.password, encKey);
            }

            callback(null, conf);
        },
        function(conf, callback) {            
            var retConf = {
                redisConf: _.clone(conf.redisConf),
                dbConf: _.clone(conf.dbConf),
                isDocker: isDocker
            };

            saveSysConf(conf, function(err) {
                if (err) {
                    return callback(err);
                }
                callback(null, retConf);
            });
        },
        function(conf, callback) {            
            for (var val in dbConf) {
                if (!conf.dbConf[val]) {
                    conf.dbConf[val] = dbConf[val];
                }
            }

            for (var val in redisConf) {
                if (!conf.redisConf[val]) {
                    conf.redisConf[val] = redisConf[val];
                }
            }
            callback(null, conf);
        }
    ], function(err, conf) {
        if (err) {
            callback(err);
            return;
        }
        //console.log(`sysConf: ${JSON.stringify(conf,null,2)}`);
        callback(null, conf)
    });
}

function saveSysConf(conf, callback) {

    var dir = path.dirname(sysconfFile);

    async.waterfall([
        function(callback) {
            getSkey(callback);
        },
        function(encKey, callback) {
            if (conf.redisConf.password && conf.redisConf.password !== S_PASS) {
                conf.redisConf.password = enc(conf.redisConf.password, encKey);
            }

            if (conf.dbConf.password && conf.dbConf.password !== S_PASS) {
                conf.dbConf.password = enc(conf.dbConf.password, encKey);
                var confToString = JSON.stringify(conf, null, 4);
                return callback(null, confToString);
            } else {
                loadSysConf(function(err, oldConf) {
                    if (err) {
                        return callback(err);
                    }

                    conf.dbConf.password = oldConf.dbConf.password;
                    var confToString = JSON.stringify(conf, null, 4);
                    return callback(null, confToString);
                });
            }
        },
        function(confToWrite, callback) {
            var fileExists = fs.existsSync(sysconfFile);
            if (!fileExists) {
                fs.mkdir(dir, '0600', function(err) {
                    callback(null, confToWrite);
                });
            } else {
                callback(null, confToWrite);
            }
        },
        function(confToWrite, callback) {
            fs.writeFile(sysconfFile, confToWrite, {
                mode: 0o600
            }, callback);
        }
    ], callback);
}

function getSkey(callback) {
    getSkeyImp().then(data => {
        callback(null, data);
    }). catch(err => {
        callback(err);
    });
}

async function fileExists(filepath) {
    try {
        await fsp.access(filepath);
        return true;
    } catch (e) {
        return false;
    }
}

async function fileMoveIfNedded(newFilePath,oldFilePath) {
    let exists = await fileExists(newFilePath);
    if (exists) {
        return;
    }
    let oldExists = await fileExists(oldFilePath);
    if (oldExists) {
        console.log(`Moving file ${oldFilePath} to new location at: ${newFilePath}`);
        await fsp.copyFile(oldFilePath,newFilePath);
        await fsp.unlink(oldFilePath);
        return;
    } else {
        throw new Error(`File not found in both old location: ${oldFilePath} and new location: ${newFilePath}`);
    }
}


async function getSkeyImp() {
    if (!isLoaded) {
       isDocker = await fileExists(DOCKERKEY);
	    console.log(`isDocker: ${isDocker}`);
       if (isDocker) {
           skeyFile = SKEY_DOCKER;
           sysconfFile = SYSCONF_DOCKER;
           
       } else {
           skeyFile = SKEY;
           sysconfFile = SYSCONF;
       }
       let foundSkey = await fileExists(skeyFile);
       if (!foundSkey) {
           console.log("Skey not found. Generate random key");
            let dir = path.dirname(skeyFile);
            await fsp.mkdir(dir,{recursive: true});
            let s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let key = Array(20).join().split(',').map(function() { return s.charAt(crypto.randomInt(0, s.length)); }).join('');
            await fsp.writeFile(skeyFile,key);
        }
        isLoaded = true;
    }
    let res = await fsp.readFile(skeyFile,"utf8");
    //console.log(`skey: ${res}`);
    return res;
    
}

var padKey = function(encKey) {
    var resKey = "";
    var addCnt = 32-encKey.length;
    while (resKey.length < addCnt) {
        resKey += '0';
    }
    return encKey+resKey;
}

function enc(plainText, encKey) {

    if (plainText.indexOf("enc:") == 0) {
        return plainText;
    }
    var iv =  crypto.randomBytes(16);
    var cipher = crypto.createCipheriv(ALGO, padKey(encKey), iv);
    var encrypted = "enc:" + cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex') + ":" + iv.toString('hex');

    /*var cipher = crypto.createCipher(ALGO, encKey);
    var encrypted = "enc:" + cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex');*/
    return encrypted;

};

function dec(encText, encKey) {

    if (encText.indexOf("enc:") != 0) {
        return encText;
    }
    var arr = encText.split(":");
    var decipher;
    if (arr.length == 2) {
        // old algorithm without IV
        decipher = crypto.createDecipher(ALGOOld, encKey);
        console.log("decrypt with old algorithm!");
    } else if (arr.length == 3) {
        // new algorith with IV
        decipher = crypto.createDecipheriv(ALGO, padKey(encKey),Buffer.from(arr[2], "hex"));
    } else {
        console.log("Invalid format for encrypted text");
        return "dec_crashed";
    }
    var encOnlyText =arr[1];

    //var encOnlyText = encText.substr(4);
    //var decipher = crypto.createDecipher(ALGO, encKey);
    var decrypted;

    try {
        decrypted = decipher.update(encOnlyText, 'hex', 'utf8') + decipher.final('utf8');
    } catch (err) {
        console.log("Err: sysConf.js::dec: " + err);
        return "dec_crashed";
    }

    return decrypted;
};

/*
function writeKey(key, callback) {

    var dir = path.dirname(SKEY);

    var fileExists = fs.existsSync(SKEY);

    if (!fileExists) {
        fs.mkdir(dir, '0o600', function(err) {
            if (err) {
                callback(err);
                return;
            }

            fs.writeFile(SKEY, key, {
                mode: 0o600
            }, callback);
        });
    } else {
        fs.writeFile(SKEY, key, {
            mode: 0o600
        }, callback);
    }
}*/

module.exports = {
    loadSysConf: loadSysConf,
    saveSysConf: saveSysConf,
    //writeKey: writeKey,
    getSkey: getSkey,
    confSchema: schema,
    getSchema: getSchema,
    fileMoveIfNedded
}
