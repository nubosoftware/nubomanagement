"use strict";
var Common = require('../common.js');
var settings = require('../settings.js');
var activate = require('../activateDevice');
var crypto = require('crypto');
var validate = require('../validate.js');
var checkPasscode = require('../checkPasscode.js');
var StartSession = require('../StartSession.js');

var emailTest;
var passcodeTest;
var loginToken;
var sessionTest;
var resTest;
var regidTest;
var pathToMgmtUnittest = process.cwd();


var pathStrings = [
        "./" + pathToMgmtUnittest + "/testFile",
        "abc;touch " + pathToMgmtUnittest + "/testFile",
        ";touch " + pathToMgmtUnittest + "/testFile",
        "abc;./" + pathToMgmtUnittest + "/testFile",
        "../" + pathToMgmtUnittest + "/unittest/testFile",
        "./testFile",
        "abc;touch testFile",
        ";touch testFile",
        "abc;./testFile",
        "../testFile",
        "abc../testFile",
        "abc./.testFile"
    ];
var emailStrings = [
        "abc;@unittest.com",
        "abc@;unittest.com",
        "abcunittest.com",
        "abc@./unittest.com",
        "abc;./@unittest.com",
        "ab;./c@unittest.com",
        "abc;./@unittest.com",
        "abc@;./unittest.com",
        "abc@;./unittest.com",
        "abc@ unittest.com",
        "abc@u./nittest.com",
        "abc@uni..ttest.com",
        "abc@unittest./com",
        "abc@unittest../com",
        "./abc@unittest.com",
        "/../abc@unittest.com",
        "/../abc@unittest.com;./sds",
        "@unittest.com;./sds",
        "./sds",
        ";./abc@unittest.com",
        "abc@unittest.com;./abc",
        "abc@unittest.com;../abc",
        "",
        " ",

    ];
var specialCharacters = [
        '<<><"</<;<`<%<!<$<&<|<.<,<\n<\t<\u000b<\r<\f<#<^<(<)<~<@<:<-<+<=<?<',
        '<>>>">/>;>`>%>!>$>&>|>.>,>\n>\t>\u000b>\r>\f>#>^>(>)>~>@>:>->+>=>?>',
        '<">"""/";"`"%"!"$"&"|".","\n"\t"\u000b"\r"\f"#"^"(")"~"@":"-"+"="?"',
        '</>/"///;/`/%/!/$/&/|/./,/\n/\t/\u000b/\r/\f/#/^/(/)/~/@/:/-/+/=/?/',
        '<;>;";/;;;`;%;!;$;&;|;.;,;\n;\t;\u000b;\r;\f;#;^;(;);~;@;:;-;+;=;?;',
        '<`>`"`/`;```%`!`$`&`|`.`,`\n`\t`\u000b`\r`\f`#`^`(`)`~`@`:`-`+`=`?`',
        '<%>%"%/%;%`%%%!%$%&%|%.%,%\n%\t%\u000b%\r%\f%#%^%(%)%~%@%:%-%+%=%?%',
        '<!>!"!/!;!`!%!!!$!&!|!.!,!\n!\t!\u000b!\r!\f!#!^!(!)!~!@!:!-!+!=!?!',
        '<$>$"$/$;$`$%$!$$$&$|$.$,$\n$\t$\u000b$\r$\f$#$^$($)$~$@$:$-$+$=$?$',
        '<&>&"&/&;&`&%&!&$&&&|&.&,&\n&\t&\u000b&\r&\f&#&^&(&)&~&@&:&-&+&=&?&',
        '<|>|"|/|;|`|%|!|$|&|||.|,|\n|\t|\u000b|\r|\f|#|^|(|)|~|@|:|-|+|=|?|',
        '<.>."./.;.`.%.!.$.&.|...,.\n.\t.\u000b.\r.\f.#.^.(.).~.@.:.-.+.=.?.',
        '<,>,",/,;,`,%,!,$,&,|,.,,,\n,\t,\u000b,\r,\f,#,^,(,),~,@,:,-,+,=,?,',
        '<\n>\n"\n/\n;\n`\n%\n!\n$\n&\n|\n.\n,\n\n\n\t\n\u000b\n\r\n\f\n#\n^\n(\n)\n~\n@\n:\n-\n+\n=\n?\n',
        '<\t>\t"\t/\t;\t`\t%\t!\t$\t&\t|\t.\t,\t\n\t\t\t\u000b\t\r\t\f\t#\t^\t(\t)\t~\t@\t:\t-\t+\t=\t?\t',
        '<\u000b>\u000b"\u000b/\u000b;\u000b`\u000b%\u000b!\u000b$\u000b&\u000b|\u000b.\u000b,\u000b\n\u000b\t\u000b\u000b\u000b\r\u000b\f\u000b#\u000b^\u000b(\u000b)\u000b~\u000b@\u000b:\u000b-\u000b+\u000b=\u000b?\u000b',
        '<\r>\r"\r/\r;\r`\r%\r!\r$\r&\r|\r.\r,\r\n\r\t\r\u000b\r\r\r\f\r#\r^\r(\r)\r~\r@\r:\r-\r+\r=\r?\r',
        '<\f>\f"\f/\f;\f`\f%\f!\f$\f&\f|\f.\f,\f\n\f\t\f\u000b\f\r\f\f\f#\f^\f(\f)\f~\f@\f:\f-\f+\f=\f?\f',
        '<#>#"#/#;#`#%#!#$#&#|#.#,#\n#\t#\u000b#\r#\f###^#(#)#~#@#:#-#+#=#?#',
        '<^>^"^/^;^`^%^!^$^&^|^.^,^\n^\t^\u000b^\r^\f^#^^^(^)^~^@^:^-^+^=^?^',
        '<(>("(/(;(`(%(!($(&(|(.(,(\n(\t(\u000b(\r(\f(#(^((()(~(@(:(-(+(=(?(',
        '<)>)")/);)`)%)!)$)&)|).),)\n)\t)\u000b)\r)\f)#)^)()))~)@):)-)+)=)?)',
        '<~>~"~/~;~`~%~!~$~&~|~.~,~\n~\t~\u000b~\r~\f~#~^~(~)~~~@~:~-~+~=~?~',
        '<@>@"@/@;@`@%@!@$@&@|@.@,@\n@\t@\u000b@\r@\f@#@^@(@)@~@@@:@-@+@=@?@',
        '<:>:":/:;:`:%:!:$:&:|:.:,:\n:\t:\u000b:\r:\f:#:^:(:):~:@:::-:+:=:?:',
        '<->-"-/-;-`-%-!-$-&-|-.-,-\n-\t-\u000b-\r-\f-#-^-(-)-~-@-:---+-=-?-',
        '<+>+"+/+;+`+%+!+$+&+|+.+,+\n+\t+\u000b+\r+\f+#+^+(+)+~+@+:+-+++=+?+',
        '<=>="=/=;=`=%=!=$=&=|=.=,=\n=\t=\u000b=\r=\f=#=^=(=)=~=@=:=-=+===?=',
        '<?>?"?/?;?`?%?!?$?&?|?.?,?\n?\t?\u000b?\r?\f?#?^?(?)?~?@?:?-?+?=???'
    ];

function createAdminAndStartSession(req, res, next, email, regid, passcode) {
    resTest = res;
    emailTest = email;
    regidTest = regid;
    passcodeTest = passcode;
    sessionTest = regid;
    var req = {};
    req.params = {
        email:emailTest
    }
    require('../userUtils.js').createOrReturnUserAndDomainRestApi(req, createOrReturnUserAndDomainRestApiRes, null);
}

var createOrReturnUserAndDomainRestApiRes = {
    send: function(obj) {
        if (obj.status  == 1) {
            var hmac = crypto.createHmac("sha1", '1981abe0d32d93967648319b013b03f05a119c9f619cc98f');
            var plain = emailTest + '_' + regidTest;
            hmac.update(plain);
            var signatureconf = hmac.digest("hex");
            var req = {};
            req.params = {
                email: emailTest,
                regid: regidTest,
                signature : signatureconf,
                title : "title",
                last : "last",
                first : "first",
                deviceid : regidTest
            }
            activate.func(req, activateRes, null)
        } else {
            resTest.send({
                status : "999",
                message : "faild to createOrReturnUserAndDomainRestApi"
            });
        }
    }
}

var activateRes = {
    send: function(obj) {
        if (obj.status == 0) {
            Common.db.Activation.update({status : 1}, {where : {activationkey : obj.activationKey}
            }).then(function() {
                var req = {};
                req.params = {
                    username: emailTest,
                    activationKey : obj.activationKey,
                    deviceid : regidTest
                };
                req.connection = {
                    remoteAddress : "localhost",
                }
                req.body = {
                    secret : settings.getMainSecretKey(),
                    session: sessionTest,
                };
                validate.func(req, validateRes, null);
            }).catch(function(err) {
                var msg = "faild to activate err = " + err;
                resTest.send({
                    status : "999",
                    message : msg
                });
            });
        } else {
            var msg = "faild to activate obj = ",obj;
            resTest.send({
                status : "999",
                message : msg
            });
        }
    }
}

var validateRes = {
    send: function(obj) {
        if (obj.status  == 1) {
            loginToken = obj.loginToken;
            Common.db.User.update({passcode : passcodeTest, isadmin : 1}, {where : {email : emailTest}
                }).then(function() {
                    var req = {};
                    req.params = {
                        loginToken : loginToken,
                        passcode : passcodeTest
                    };
                    req.body = {
                        secret : settings.getMainSecretKey(),
                        session: sessionTest,
                    };
                    req.connection = {
                        remoteAddress: "localhost"
                    };
                    checkPasscode.func(req, checkPasscodeRes, null);
                }).catch(function(err) {
                    var msg = "faild to validate err = ",err;
                    resTest.send({
                        status : "999",
                        message : msg
                    });
                });
        } else {
            var msg = "faild to validate obj = ",obj;
            resTest.send({
                status : "999",
                message : msg
            });
        }
    }
}

var checkPasscodeRes = {
    send: function(obj) {
        if (obj.status  == 1) {
            var req = {};
            req.params = {
                loginToken : loginToken,
                passcode : passcodeTest
            };
            req.body = {
                secret : settings.getMainSecretKey(),
                session: sessionTest,
            };
            req.connection = {
                remoteAddress: "localhost"
            };
            StartSession.func(req, resTest, null);
        } else {
            var msg = "faild to checkPasscode obj = ",obj;
            resTest.send({
                status : "999",
                message : msg
            });
        }
    }
}




var testUtils = {
    pathStrings : pathStrings,
    specialCharacters : specialCharacters,
    emailStrings : emailStrings,
    createAdminAndStartSession : createAdminAndStartSession
    };
module.exports = testUtils;
