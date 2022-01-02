"use strict";


const pem = require('pem');
const fs = require('fs');
const async = require('async');



let item;
async.series([

    (cb) => {
        pem.createCertificate({ days: 36500, selfSigned: true }, function (err, keys) {
            //console.log(`keys: ${JSON.stringify(keys,null,2)}`);
            item = keys;
            cb(err);
          });
    },
    (cb) => {
        pem.getPublicKey(item.clientKey,(err,keys) => {
            let res = {
                publicKey: keys.publicKey,
                privateKey: item.clientKey
            };
            //console.log(`keys: ${JSON.stringify(res,null,2)}`);
            console.log(`Private key for management backend:\n\n"platformKey": ${JSON.stringify(item.clientKey)}\n`);
            console.log(`Public key for platforms:\n\n"managementPublicKey": ${JSON.stringify(keys.publicKey)}\n`);
            cb(err);

        });
    }
],(err) => {
    if (err) {
        console.error("Error",err);
    } else {
        //console.log("Done");
    }
});


