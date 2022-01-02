'use strict';
const crypto = require('crypto');

let alg = 'aes-256-cbc';

// get password's md5 hash
let password = 'tefdsfsdfdsgfdgfdgdfgdfgdgsdst';
let password_hash = crypto.createHash('md5').update(password, 'utf-8').digest('hex').toUpperCase();
console.log('key=', password_hash); // 098F6BCD4621D373CADE4E832627B4F6

// our data to encrypt
let data = '06401;0001001;04;15650.05;03';
console.log('data=', data);

// generate initialization vector
let iv =  crypto.randomBytes(16);//new Buffer.alloc(16); // fill with zeros
console.log('iv=', iv);

// encrypt data
let cipher = crypto.createCipheriv(alg, password_hash, iv);
let encryptedData = cipher.update(data, 'utf8', 'hex') + cipher.final('hex') + "," + iv.toString('hex');

console.log('encrypted data=', encryptedData);

var cipherecb = crypto.createCipher('aes-128-ecb', password);
var encrypted = cipherecb.update(data, 'utf8', 'hex') + cipherecb.final('hex');
console.log('encrypted aes-128-ecb=', encrypted.toUpperCase());


var arr = encryptedData.split(",");

var decipher = crypto.createDecipheriv(alg, password_hash,new Buffer(arr[1], "hex"));
try {
    var decrypted = decipher.update(arr[0], 'hex', 'utf8') + decipher.final('utf8');
    console.log("decrypted: "+decrypted);
} catch (err) {
    console.error("Common.js::dec: " + err);
}

/*var decipher = crypto.createDecipher('aes-128-ecb', password);
try {
    var decrypted = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    console.log("decrypted: "+decrypted);
} catch (err) {
    console.error("Common.js::dec: " + err);
}*/

console.log(crypto.getCiphers())