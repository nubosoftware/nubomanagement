"use strict";
var Common = require("./common.js");
var validate = require('validate.js');
var constraints = require("@nubosoftware/nubo-validateconstraints")(validate);


function getRules() {
    let rules = filter.rules;
    if (Common.isEnterpriseEdition()) {
        rules = rules.concat(Common.getEnterprise().parametersMap.getParameterMapRules(constraints));
    }
    if (Common.isMobile()) {
        rules = rules.concat(Common.getMobile().parametersMap.getParameterMapRules(constraints));
    }
    return rules;
}
var filter = {
    "rules": [{
        "path": "/favicon.ico"
    }, {
        "path": "/startsession",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginToken": constraints.requestedLoginTokenConstr,
            "platid": constraints.platIdConstrOptional,
            "timeZone": constraints.timeZoneConstrOptional,
            "fastConnection": {
                "inclusion": {
                    "within": ["true"]
                }
            }
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        },
        "bodyConstraints": {
            "timeZone": constraints.timeZoneConstrOptional,
            "width": constraints.NaturalNumberConstrOptional,
            "height": constraints.NaturalNumberConstrOptional,
            "densityDpi": constraints.NaturalNumberConstrOptional,
            "xdpi": constraints.floatOptional,
            "ydpi": constraints.floatOptional,
            "scaledDensity": constraints.floatOptional,
            "rotation": constraints.NaturalNumberConstrOptional,
            "navBarHeightPortrait": constraints.NaturalNumberConstrOptional,
            "navBarHeightLandscape": constraints.NaturalNumberConstrOptional,
            "navBarWidth": constraints.NaturalNumberConstrOptional,
            "romClientType": constraints.NaturalNumberConstrOptional,
            "romSdkVersion": constraints.NaturalNumberConstrOptional,
            "romBuildVersion": constraints.ExcludeSpecialCharactersOptional,
            "nuboClientMaxMemory": constraints.NaturalNumberConstrOptional,
            "nuboClientVersion": constraints.ExcludeSpecialCharactersOptional,
            "nuboProtocolVersion": constraints.ExcludeSpecialCharactersOptional,
            "nuboVersionCode": constraints.NaturalNumberConstrOptional,
            "networkConQuality": constraints.NaturalNumberConstrOptional,
            "nuboFlags": constraints.NaturalNumberConstrOptional,
            "packageName": constraints.ExcludeSpecialCharactersOptional,
            "biometricCanAuthenticate": constraints.NaturalNumberConstrOptional,
            "appName": {},
            "camerasInfo": {}
        }
    }, {
        "path": "/file/uploadToSession",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "session": constraints.sessionIdConstrRequested,
            "isMedia": constraints.boolConstrOptional
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/file/uploadDummyFile",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/file/uploadFileToLoginToken",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
            "sessionid": constraints.sessionIdConstrOptional,
            "existsOnSDcard": {
                "inclusion": {
                    "within": ["external://", "internal://"]
                }
            },
            "dontChangeName": constraints.boolConstrOptional,
            "destPath": constraints.pathConstrOptional,
            "isMedia": constraints.boolConstrOptional
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/file/uploadToLoginToken",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginToken": constraints.requestedLoginTokenConstr,
            "existsOnSDcard": {
                "inclusion": {
                    "within": ["external://", "internal://"]
                }
            },
            "dontChangeName": constraints.boolConstrOptional,
            "destPath": constraints.pathConstrOptional,
            "isMedia": constraints.boolConstrOptional
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        },
        "bodyConstraints": { }
    }, {
        "path": "/cp/getProfiles",
        "constraints": {
            "nextEmailToken": constraints.emailConstrOptional,
            "online": constraints.Y_N_boolConstrOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
            "online": constraints.Y_N_boolConstrOptional,
            "limit": constraints.NaturalNumberConstrOptional,
            "offset": constraints.NaturalNumberConstrOptional,
            "sortBy": {
                array: constraints.ExcludeSpecialCharactersOptional
            },
            "sortDesc": {
                array: constraints.Y_N_boolConstrOptional
            },
            "search": constraints.ExcludeSpecialCharactersOptional,
        }
    }, {
        "path": "/cp/addAdmins",
        "constraints": {
            "email": constraints.emailConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/removeAdmins",
        "constraints": {
            "email": constraints.emailConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getProfileDetails",
        "constraints": {
            "email": constraints.emailConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/addProfile",
        "constraints": {
            "first": constraints.ExcludeSpecialCharactersRequested,
            "last": constraints.ExcludeSpecialCharactersRequested,
            "email": constraints.emailConstrRequested,
            "manager": constraints.ExcludeSpecialCharactersOptional,
            "country": constraints.ExcludeSpecialCharactersOptional,
            "officePhone": constraints.phoneNumberConstrOptional,
            "mobilePhone": constraints.phoneNumberConstrOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/updateProfileDetails",
        "constraints": {
            "first": constraints.ExcludeSpecialCharactersRequested,
            "last": constraints.ExcludeSpecialCharactersRequested,
            "email": constraints.emailConstrRequested,
            "manager": constraints.ExcludeSpecialCharactersOptional,
            "country": constraints.ExcludeSpecialCharactersOptional,
            "officePhone": constraints.phoneNumberConstrOptional,
            "mobilePhone": constraints.phoneNumberConstrOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteProfiles",
        "constraints": {
            "email": {
                array: constraints.emailConstrRequested
            },
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/activateProfiles",
        "constraints": {
            "activate": constraints.Y_N_boolConstrRequested,
            "email": constraints.emailConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/activateDevice",
        "constraints": {
            "email": constraints.emailConstrRequested,
            "imei": constraints.deviceIdConstrRequested,
            "activate": constraints.Y_N_boolConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/settings/changePasscode",
        "constraints": {
            "curPasscode": constraints.passcodeConstrRequested,
            "newPasscode": constraints.passcodeConstrRequested
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/checkPasscode",
        "constraints": {
            "curPasscode": constraints.passcodeConstrRequested
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/setLanguage",
        "constraints": {
            "langCode": constraints.ExcludeSpecialCharactersRequested,
            "countryCode": constraints.ExcludeSpecialCharactersRequested,
            "updateOtherDevices": constraints.boolConstrOptional
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/getNuboSettingsSecurityPasscode",
        "constraints": {
            "getpasscodetypechange": constraints.Y_N_boolConstrOptional
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/getSessionDetails",
        "constraints": {},
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/changeExpiredPassword",
        "constraints": {
            "sessionId": constraints.sessionIdConstrOptional
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/uninstallApkForUser",
        "constraints": {
            "packageName": {}
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/installApkForUser",
        "constraints": {
            "apkPath": {}
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/canInstallListForUser",
        "constraints": {
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/factoryReset",
        "constraints": {
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    },
    {
        "path": "/settings/setNotificationStatusForApp",
        "constraints": {
            "appName": {
                "presence": true,
                "inclusion": ["Email", "Calendar", "Messaging", "Messenger"]
            },
            "notificationStatus": constraints.binaryBoolConstrRequested
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/setNotificationSound",
        "constraints": {
            "enableSound": constraints.binaryBoolConstrRequested
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/setNotificationVibrate",
        "constraints": {
            "enableVibrate": constraints.binaryBoolConstrRequested
        },
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/settings/getNotificationsStatusForAllApps",
        "constraints": {},
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/cp/inviteProfiles",
        "constraints": {
            "email": {
                array: constraints.emailConstrRequested
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteAppFromProfiles",
        "constraints": {
            "email": constraints.emailConstrRequested,
            "packageName": constraints.packageNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/createGroup",
        "constraints": {
            "email": {
                array: constraints.emailConstrRequested
            },
            "groupName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/addProfilesToGroup",
        "constraints": {
            "adDomain": constraints.adDomainNameConstrRequested,
            "email": {
                array: {
                    email: constraints.emailConstrRequested
                }
            },
            "groupName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getGroups",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getGroupDetails",
        "constraints": {
            "adDomain": constraints.adDomainNameConstrOptional,
            "groupName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getAllApps",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteGroups",
        "constraints": {
            "groupName": constraints.ExcludeSpecialCharactersRequested,
            "adDomain": constraints.adDomainNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getCompanyDetails",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/installApps",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested,
            "email": {
                array: {
                    "email": constraints.emailConstrOptional
                }
            },
            "groupName": constraints.ExcludeSpecialCharactersOptional,
            "adDomain": constraints.adDomainNameConstrOptional,
            "privateApp": {
                "inclusion": ["", "0", "1"]
            },
            "appStoreOnly": {
                "inclusion": ["", "0", "1"]
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getProfilesFromApp",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/removeProfilesFromGroup",
        "constraints": {
            "email": {
                array: constraints.emailConstrRequested
            },
            "groupName": constraints.ExcludeSpecialCharactersRequested,
            "adDomain": constraints.adDomainNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getBlockedDevices",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/addBlockedDevicesRule",
        "constraints": {
            "ruleName": constraints.ExcludeSpecialCharactersRequested,
            "filterName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteBlockedDevicesRule",
        "constraints": {
            "ruleid": constraints.NaturalNumberConstrRequested,
            "ruleName": constraints.ExcludeSpecialCharactersRequested,
            "deviceName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/updateBlockedDevicesRule",
        "constraints": {
            "ruleid": constraints.NaturalNumberConstrRequested,
            "deviceName": constraints.ExcludeSpecialCharactersRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/approveUsers",
        "constraints": {
            "email": {
                "email": constraints.emailConstrRequested
            },
            "approve": constraints.Y_N_boolConstrRequested,
            "all": constraints.Y_N_boolConstrRequested,
            "deviceId": constraints.deviceIdConstrOptional,
            "approveType": constraints.ExcludeSpecialCharactersOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteApk",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getAdminDeviceApproval",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getSecurityPasscode",
        "constraints": {
            "getpasscodetypechange": {
                "inclusion": ["", "Y", "N"]
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/setSecurityPasscode",
        "constraints": {
            "passcodeType": constraints.binaryBoolConstrRequested,
            "minChars": {
                "presence": true,
                "numericality": {
                    "onlyInteger": true,
                    "greaterThan": 5,
                    "lessThan": 32
                }
            },
            "expirationDays": {
                "presence": true,
                "numericality": {
                    "onlyInteger": true,
                    "greaterThanOrEqualTo": 0,
                    "lessThan": 9999
                }
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getWaitingForApprovalProfiles",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/killDeviceSession",
        "constraints": {
            "email": constraints.emailConstrRequested,
            "imei": constraints.deviceIdConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/updateDeviceApproval",
        "constraints": {
            "deviceApprovalType": {
                "presence": true,
                "inclusion": ["0", "1", "2"]
            },
            "notifierAdmin": {
                "email": constraints.emailConstrOptional
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/checkCertificate",
        "constraints": {
            "email": constraints.emailConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getNetwotkAccessStatus",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/setNetwotkAccessStatus",
        "constraints": {
            "accessStatus": {
                "presence": true,
                "inclusion": {
                    "within": ["open", "close"]
                }
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/addAppRule",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested,
            "ip": constraints.ipConstrRequested,
            "port": constraints.portNumberConstrRequested,
            "protocol": {
                "presence": true,
                "inclusion": {
                    "within": ["TCP", "UDP", "ICMP", "All Protocols"]
                }
            },
            "mask": constraints.CIDRMaskConstrRequested,
            "ipVersion": {
                "presence": true,
                "inclusion": {
                    "within": ["v4", "v6"]
                }
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getRules",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteAppRule",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested,
            "ip": constraints.ipConstrRequested,
            "port": constraints.portNumberConstrRequested,
            "protocol": {
                "presence": true,
                "inclusion": {
                    "within": ["TCP", "UDP", "ICMP", "All Protocols"]
                }
            },
            "mask": constraints.CIDRMaskConstrRequested,
            "ipVersion": {
                "presence": true,
                "inclusion": {
                    "within": ["v4", "v6"]
                }
            },
            "ruleid": constraints.IndexConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/editAppRule",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested,
            "ip": constraints.ipConstrRequested,
            "port": constraints.portNumberConstrRequested,
            "protocol": {
                "presence": true,
                "inclusion": {
                    "within": ["TCP", "UDP", "ICMP", "All Protocols"]
                }
            },
            "mask": constraints.CIDRMaskConstrRequested,
            "ipVersion": {
                "presence": true,
                "inclusion": {
                    "within": ["v4", "v6"]
                }
            },
            "ruleid": constraints.IndexConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/checkApkStatus",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/updateApkDescription",
        "constraints": {
            "packageName": constraints.packageNameConstrRequested,
            "appName": constraints.ExcludeSpecialCharactersOptional,
            "appDescription": {},
            "appSummary": constraints.ExcludeSpecialCharactersOptional,
            "appCategories": constraints.ExcludeSpecialCharactersOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getAppUsageWeeklyDashboard",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getMainDashboard",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getOnlineUsersGroupDashboard",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/getTabletDashboard",
        "constraints": {},
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/resetLoginAttemptsToUser",
        "constraints": {
            "email": constraints.emailConstrRequested,
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": '/getResource',
        "constraints": {
            "fileName": constraints.pathConstrRequested,
            "packageName": constraints.packageNameConstrOptional,
            "sessionid": constraints.sessionIdConstrOptional
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/Notifications/pushNotification",
        "constraints": {
            "email": {
                array: constraints.userNameConstrRequested
            },
            "titleText": constraints.openTextConstrRequested,
            "notifyTime": constraints.openTextConstrRequested,
            "notifyLocation": constraints.openTextConstrRequested,
            "appName": constraints.ExcludeSpecialCharactersRequested,
            "authKey": constraints.ExcludeSpecialCharactersRequested
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        }
    }, {
        "path": "/getNuboRecordings",
        "constraints": {
            "name": constraints.ExcludeSpecialCharactersOptional,
            "from": constraints.ExcludeSpecialCharactersOptional,
            "to": constraints.ExcludeSpecialCharactersOptional
        }
    }, {
        "path": "/cp/getLogs",
        "constraints": {
            "u": constraints.emailConstrRequested,
            "mtype": {
                "inclusion": ["", "important"]
            },
            "limit": constraints.NaturalNumberConstrOptional,
            "s": constraints.packageNameConstrRequested,
            "e": constraints.NaturalNumberConstrOptional
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/deleteApps",
        "constraints": {
            "email": {
                array: {
                    email: constraints.emailConstrOptional
                }
            },
            "groupName": {
                array: constraints.ExcludeSpecialCharactersOptional
            },
            "adDomain": {
                array: constraints.adDomainNameConstrOptional
            },
            "packageName": {
                array: constraints.packageNameConstrRequested
            }
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        }
    }, {
        "path": "/cp/generateReports",
        "constraints": {
            "reportId": constraints.NaturalNumberConstrRequested
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        },
        "bodyConstraints": {
            "session": constraints.sessionIdConstrRequested
        }
    }, {
        "path": "/SmsNotification/sendSmsNotification",
        "constraints": {
            "toPhone": constraints.ExcludeSpecialCharactersOptional,
            "body": constraints.ExcludeSpecialCharactersOptional
        }
    }, {
        "path": "/opt/Android-Nougat/ramdisk.img",
        "constraints": {}
    }, {
        "path": "/opt/Android-Nougat/system.img",
        "constraints": {}
    }, {
        "path": "/opt/Android-Nougat/userdata.img",
        "constraints": {}
    }, {
        "path": "/opt/Android-KitKat/ramdisk.img",
        "constraints": {}
    }, {
        "path": "/opt/Android-KitKat/system.img",
        "constraints": {}
    }, {
        "path": "/opt/Android-KitKat/userdata.img",
        "constraints": {}
    }, {
        "path": "/status",
        "constraints": {}
    }, {
        "path": "/checkPasscode",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginToken": constraints.requestedLoginTokenConstr,
            "passcode": constraints.passcodeConstrRequested
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/checkBiometric",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
            "token": constraints.passcodeConstrRequested
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/setPasscode",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginToken": constraints.requestedLoginTokenConstr,
            "passcode": constraints.passcodeConstrRequested,
            "oldpasscode": constraints.passcodeConstrOptional,
            "passcode2": constraints.passcodeConstrOptional,
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/resetPasscode",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginToken": constraints.loginTokenConstrOptional,
            "activationKey":  constraints.tokenConstrOptional,
            "action": {
                "numericality": {
                    "onlyInteger": true,
                    "greaterThan": 0,
                    "lessThan": 20
                }
            },
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/activate",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "email": constraints.userNameConstrRequested,
            "deviceid": constraints.deviceIdConstrRequested,
            "imsi": {
                "format": "^[0-9a-zA-Z]+$|^$",
                "length": {
                    "minimum": 0,
                    "maximum": 15
                }
            },
            "hideNuboAppPackageName": constraints.packageNameConstrOptional,
            "deviceName": constraints.ExcludeSpecialCharactersOptional,
            "alreadyUser": constraints.Y_N_boolConstrOptional,
            "first": constraints.ExcludeSpecialCharactersOptional,
            "last": constraints.ExcludeSpecialCharactersOptional,
            "title": constraints.openTextConstrOptional,
            "deviceType": {
                "presence": false,
                "inclusion": ["iPhone", "iPad", "Web", "Android","Desktop"]
            },
            "silentActivation": {
                "inclusion": {
                    "within": [" ", "true", "false"]
                }
            },
            "signature": constraints.ExcludeSpecialCharactersOptional,
            "regid": {
                "presence": false,
                "format": "^[.a-zA-Z0-9_\\-():]+$|^$",
                "length": {
                    "minimum": 0,
                    "maximum": 255
                }
            },
            "playerVersion": constraints.playerVersionConstrOptional,
            "additionalDeviceInfo": constraints.ExcludeSpecialCharactersOptional,
            "captcha": {},
            "phoneNumber": constraints.phoneNumberConstrOptional
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/activationLink",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "token": {
                "presence": true,
                "format" : "^[a-f0-9]+$",
                "length" : {
                    "minimum": 5,
                    "maximum": 255
                }
            },
            "cloneActivation": constraints.activationConstrOptional,
            "email": constraints.emailConstrOptional,
            "smsActivation": constraints.boolConstrOptional
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/validate",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "username": constraints.userNameConstrOptional,
            "deviceid": constraints.deviceIdConstrRequested,
            "activationKey": constraints.tokenConstrRequested,
            "playerVersion": constraints.playerVersionConstrRequested,
            "timeZone": constraints.timeZoneConstrOptional,
            "hideNuboAppPackageName": constraints.packageNameConstrOptional,
            "newProcess": constraints.boolConstrOptional,
            "lang": constraints.timeZoneConstrOptional
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": '/notificationPolling',
        "constraints": {
            "activationKey": constraints.tokenConstrRequested,
            "username": constraints.userNameConstrOptional,
            "timestamp": constraints.timeStampConstrOptional,
            "sessionid": constraints.sessionIdConstrOptional
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/resendUnlockPasswordLink",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "activationKey": constraints.tokenConstrRequested
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/unlockPassword",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "loginemailtoken": constraints.requestedLoginTokenConstr,
            "email": constraints.emailConstrRequested,
            "mainDomain": constraints.adDomainNameConstrRequested,
            "deviceID": constraints.deviceIdConstrRequested,
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/addMissingResource",
        "constraints": {},
        "bodyConstraints": {
            "resource": constraints.pathConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/updateUserConnectionStatics",
        "constraints": {},
        "bodyConstraints": {
            "pathname": constraints.pathConstrRequested,
            "deviceName": constraints.ExcludeSpecialCharactersOptional,
            "resolution": constraints.ExcludeSpecialCharactersOptional
        }
    }, {
        "path": "/getResourceListByDevice",
        "constraints": {
            "sessionid": constraints.sessionIdConstrOptional,
            "deviceName": constraints.ExcludeSpecialCharactersOptional,
            "resolution": constraints.ExcludeSpecialCharactersOptional
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/registerGateway",
        "constraints": {
            "baseIndex": constraints.IndexConstrRequested,
            "offset": constraints.IndexConstrRequested,
            "internal_ip": constraints.hostConstrRequested,
            "controller_port": constraints.portNumberConstrOptional,
            "apps_port": constraints.portNumberConstrOptional,
            "index": constraints.IndexConstrOptional,
            "external_ip": constraints.adDomainNameConstrRequested,
            "player_port": constraints.portNumberConstrOptional,
            "ssl": constraints.boolConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/updateGatewayTtl",
        "constraints": {
            "idx": constraints.IndexConstrRequested,
            "ttl": constraints.IndexConstrRequested,
            "internal_ip": constraints.hostConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/validateUpdSession",
        "constraints": {
            "session": constraints.sessionIdConstrOptional,
            "suspend": {
                "inclusion": {
                    "within": ["0", "1" ,"2"]
                }
            }
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/unregisterGateway",
        "constraints": {
            "idx": {
                array: constraints.platIdConstrRequested
            }
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/reportRecording",
        "constraints": {
            "publishMsg": constraints.openTextConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/addPlatform2ErrsList",
        "constraints": {
            "platformID": constraints.platIdConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/isPlatformInPlatformsList",
        "constraints": {
            "platformID": constraints.platIdConstrRequested,
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/redisGateway/checkLoginTokenOnRedis",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/cp/runAdSync",
        "bodyConstraints": {
            "session": constraints.sessionIdConstrOptional,
            "adminLoginToken": constraints.loginTokenConstrOptional,
        },
        "headerConstraints": {
            "controlpanelid": constraints.controlPanelIDConstrOptional
        }
    }, {
        "path": "/checkOtpAuth",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
            "OTPCode": {
                "format": "^[a-zA-Z0-9\=]*$",
                "presence": true,
                "length": {
                    "minimum": 1,
                    "maximum": 255
                }
            }
        }
    }, {
        "path": "/resendOtpCode",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr
        }
    }, {
        "path": "/getClientConf",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
            "supportedConf": constraints.NaturalNumberConstrRequested,
            "regid": {
                "presence": false,
                "format": "^[.a-zA-Z0-9_\\-():]+$|^$",
                "length": {
                    "minimum": 0,
                    "maximum": 255
                }
            }
        }
    }, {
        "path": "/recheckValidate",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
        }
    }, {
        "path": "/checkStatus",
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/frontEndService/registerFrontEnd",
        "constraints": {
            "hostname": constraints.hostConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/frontEndService/refreshFrontEndTTL",
        "constraints": {
            "index": constraints.NaturalNumberConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    }, {
        "path": "/frontEndService/unregisterFrontEnd",
        "constraints": {
            "index": constraints.NaturalNumberConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },
    {
        "path": "/notifyWindowAction",
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "constraints": {
            "intent": constraints.openTextConstrRequested,
            "username": constraints.userNameConstrOptional,
            "session": constraints.sessionIdConstrRequested,
            "action": constraints.ExcludeSpecialCharactersRequested,
        }
    },
    {
        "path": "/platformUserNotification",
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "constraints": {
            "pkg": constraints.openTextConstrRequested,
            "username": constraints.userNameConstrRequested,
            "session": constraints.sessionIdConstrRequested,
            "keyHash": constraints.ExcludeSpecialCharactersRequested,
            "action": {
                "presence": true,
                "inclusion": ["1", "2"]
            },
            "title": constraints.openTextConstrOptional,
            "text": constraints.openTextConstrOptional,
            "hasSound": constraints.binaryBoolConstrRequested,
            "hasVibrate": constraints.binaryBoolConstrRequested
        }
    },
    {
        "path": "/sendSMS",
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "constraints": {
            "pkg": constraints.openTextConstrRequested,
            "username": constraints.userNameConstrRequested,
            "session": constraints.sessionIdConstrRequested,
            "destAddr": constraints.ExcludeSpecialCharactersRequested,
            "text": constraints.openTextConstrOptional
        }
    },
    {
        "path": "/receiveSMS",
        "headerConstraints": {
            "nubosettingsid": constraints.settingsIDConstrRequested
        },
        "constraints": {
            "text": constraints.openTextConstrOptional
        }
    },
    {
        "path": "/logoutUser",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr,
            "deleteCacheDeviceData": constraints.Y_N_boolConstrOptional,
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },
    {
        "path": "/declineCall",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },
    {
        "path": "/closeOtherSessions",
        "constraints": {
            "loginToken": constraints.requestedLoginTokenConstr
        },
        "headerConstraints": {
            'x-client-ip': constraints.ipConstrRequested,
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },
    {
        "path": "/loginWebAdmin",
        "constraints": {
        },
        "headerConstraints": {

        },
        "bodyConstraints": {
            "userName": constraints.userNameConstrRequested,
            "password": constraints.passcodeConstrRequested,
        }
    },
    {
        "path": "/selfRegisterPlatform",
        "constraints": {
            "platform_ip": constraints.hostConstrRequested,
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },
    {
        "path": "/selfRegisterPlatformTtl",
        "constraints": {
            "idx": constraints.IndexConstrRequested,
            "platform_ip": constraints.hostConstrRequested
        },
        "headerConstraints": {
            'fe-user': constraints.ExcludeSpecialCharactersRequested,
            'fe-pass': constraints.passcodeConstrRequested
        }
    },

    {
        "regex": true,
        "path": "/api/.*|^/appstore/|^/html/",
        "constraints": {
        },
        "headerConstraints": {
        },
        "bodyConstraints": {

        }
    },



    ]
};

module.exports = getRules;
