var webClientList = {
    "/status": 1,
    '/resources/demos/style.css': 1,
    '/favicon.ico': 1,
    "/opt/Android-Nougat/ramdisk.img": 1,
    "/opt/Android-Nougat/system.img": 1,
    "/opt/Android-Nougat/userdata.img": 1,
};

var noFilterList = {
    '/validate': 1,
    '/activationLink': 1,
    '/activate': 1,

    '/startsession': 1,
    '/resetPasscode': 1,
    '/logoutUser': 1,
    '/declineCall': 1,
    '/SmsNotification/sendSmsNotification': 1,
    '/resendUnlockPasswordLink': 1,
    '/unlockPassword': 1,
    '/addMissingResource': 1,
    '/updateUserConnectionStatics': 1,
    '/getResourceListByDevice': 1,
    '/receiveSMS': 1,

    '/closeOtherSessions': 1,
    '/loginWebAdmin': 1,
    '/api/auth': 1,
    '/api/auth/activate': 1,
    '/api/auth/validate': 1,
    '/api/auth/reset': 1,

};

var settingsList = {
    '/settings/changePasscode': 1,
    '/settings/checkPasscode': 1,
    '/settings/setLanguage': 1,
    '/settings/getSessionDetails': 1,
    '/settings/changeExpiredPassword': 1,
    '/settings/setNotificationStatusForApp': 1,
    '/settings/getNotificationsStatusForAllApps': 1,
    '/settings/setNotificationVibrate': 1,
    '/settings/setNotificationSound': 1,
    '/settings/getNuboSettingsSecurityPasscode': 1,
    '/changeExpiredPassword': 1,
    '/notifyWindowAction': 1,
    '/platformUserNotification': 1,
    '/sendSMS': 1,
    '/settings/installApkForUser': 1,
    '/settings/uninstallApkForUser': 1,
    '/settings/canInstallListForUser': 1,
    '/settings/factoryReset': 1

};

var controlPanelList = {
    '/cp/getProfiles': 1,
    '/cp/addAdmins': 1,
    '/cp/removeAdmins': 1,
    '/cp/getProfileDetails': 1,
    '/cp/addProfile': 1,
    '/cp/deleteProfiles': 1,
    '/cp/activateProfiles': 1,
    '/cp/activateDevice': 1,
    '/cp/checkCertificate': 1,
    '/cp/inviteProfiles': 1,
    '/cp/deleteAppFromProfiles': 1,
    '/cp/deleteApps': 1,
    '/cp/createGroup': 1,
    '/cp/addProfilesToGroup': 1,
    '/cp/installApps': 1,
    '/cp/getProfilesFromApp': 1,
    '/cp/updateProfileDetails': 1,
    '/cp/removeProfilesFromGroup': 1,
    '/cp/getGroups': 1,
    '/cp/getAllApps': 1,
    '/cp/getGroupDetails': 1,
    '/cp/deleteGroups': 1,
    '/cp/getCompanyDetails': 1,
    '/cp/deleteApk': 1,
    '/cp/setSecurityPasscode': 1,
    '/cp/getSecurityPasscode': 1,
    '/cp/getBlockedDevices': 1,
    '/cp/deleteBlockedDevicesRule': 1,
    '/cp/updateBlockedDevicesRule': 1,
    '/cp/addBlockedDevicesRule': 1,
    '/cp/killDeviceSession': 1,
    '/cp/approveUsers': 1,
    '/cp/updateDeviceApproval': 1,
    '/cp/getAdminDeviceApproval': 1,
    '/cp/getWaitingForApprovalProfiles': 1,
    '/cp/killDeviceSession': 1,
    '/cp/getLogs': 1,
    '/cp/generateReports': 1,
    '/cp/checkApkStatus': 1,
    '/cp/updateApkDescription': 1,
    '/cp/addAppRule': 1,
    '/cp/getNetwotkAccessStatus': 1,
    '/cp/getRules': 1,
    '/cp/setNetwotkAccessStatus': 1,
    '/cp/getAppUsageWeeklyDashboard': 1,
    '/cp/setNetwotkAccessStatus': 1,
    '/cp/getLastSessionsDashboard': 1,
    '/cp/getMainDashboard': 1,
    '/cp/getTabletDashboard': 1,
    '/cp/getOnlineUsersGroupDashboard': 1,
    '/cp/runAdSync': 1,
    '/api/profiles': 1,
};

var gatewayList = {
    '/redisGateway/updateGatewayTtl': 1,
    '/redisGateway/registerGateway': 1,
    '/redisGateway/unregisterGateway': 1,
    '/redisGateway/checkLoginTokenOnRedis': 1,
    '/redisGateway/isPlatformInPlatformsList': 1,
    '/redisGateway/addPlatform2ErrsList': 1,
    '/redisGateway/reportRecording': 1,
    '/redisGateway/validateUpdSession': 1,
    '/selfRegisterPlatform': 1,
    '/selfRegisterPlatformTtl': 1,
};

var feList = {
    '/frontEndService/registerFrontEnd': 1,
    '/frontEndService/refreshFrontEndTTL': 1,
    '/frontEndService/unregisterFrontEnd': 1
};


var excludeList = {
    'SESSID': {
        '/createOrReturnUserAndDomain': 1,
        '/createDomainForUser': 1,
        '/file/uploadToLoginToken': 1,
        '/file/uploadDummyFile': 1,
        '/Notifications/notifyExchangeClient': 1,
        '/Notifications/pushNotification': 1,
        '/Notifications/sendNotificationFromRemoteServer': 1,
        '/getNuboRecordings': 1,
        '/getResource': 1,
        '/validateAuthentication': 1,
        '/createUserFolders': 1,
        '/updateUserAccount': 1,
        '/checkPasscode': 1,
        '/setPasscode': 1,
        '/resetPasscode': 1,
        '/notificationPolling': 1,
        '/checkOtpAuth': 1,
        '/resendOtpCode': 1,
        '/getClientConf': 1,
        '/checkStatus': 1,
        '/receiveSMS': 1,
        '/checkBiometric': 1,
        '/recheckValidate': 1,
    },
    'ISADMIN': {
        '/createOrReturnUserAndDomain': 1,
        '/file/uploadToLoginToken': 1,
        '/file/uploadDummyFile': 1,
        '/createDomainForUser': 1,
        '/Notifications/notifyClient': 1,
        '/Notifications/notifyExchangeClient': 1,
        '/Notifications/pushNotification': 1,
        '/Notifications/sendNotificationFromRemoteServer': 1,
        '/getResource': 1,
        '/validateAuthentication': 1,
        '/createUserFolders': 1,
        '/updateUserAccount': 1,
        '/checkPasscode': 1,
        '/setPasscode': 1,
        '/resetPasscode': 1,
        '/captureDeviceDetails': 1,
        '/notificationPolling': 1,
        '/checkOtpAuth': 1,
        '/resendOtpCode': 1,
        '/getClientConf': 1,
        '/checkStatus': 1,
        '/receiveSMS': 1,
        '/checkBiometric': 1,
        '/recheckValidate': 1,
    },
    'LOGINTOKEN': {
        '/createOrReturnUserAndDomain': 1,
        '/createDomainForUser': 1,
        '/file/uploadToSession': 1,
        '/Notifications/notifyClient': 1,
        '/Notifications/notifyExchangeClient': 1,
        '/Notifications/pushNotification': 1,
        '/Notifications/sendNotificationFromRemoteServer': 1,
        '/getNuboRecordings': 1,
        '/getResource': 1,
        '/validateAuthentication': 1,
        '/createUserFolders': 1,
        '/updateUserAccount': 1,

        '/captureDeviceDetails': 1,
        '/notificationPolling': 1,
        '/notificationPolling': 1,
        '/checkStatus': 1,
        '/receiveSMS': 1,
    },
    'NOLOGIN_REGEX': /^\/appstore\//,
    'PLATUID': {
        '/createOrReturnUserAndDomain': 1,
        '/createDomainForUser': 1,
        '/file/uploadToLoginToken': 1,
        '/file/uploadDummyFile': 1,
        '/Notifications/notifyExchangeClient': 1,
        '/Notifications/pushNotification': 1,
        '/Notifications/sendNotificationFromRemoteServer': 1,
        '/getNuboRecordings': 1,
        '/getResource': 1,
        '/validateAuthentication': 1,
        '/createUserFolders': 1,
        '/updateUserAccount': 1,
        'Notifications/notifyClient': 1,
        '/file/uploadToSession': 1,
        '/checkPasscode': 1,
        '/setPasscode': 1,
        '/resetPasscode': 1,
        '/captureDeviceDetails': 1,
        '/notificationPolling': 1,
        '/checkOtpAuth': 1,
        '/resendOtpCode': 1,
        '/getClientConf': 1,
        '/checkStatus': 1,
        '/receiveSMS': 1,

        '/checkBiometric': 1,
        '/recheckValidate': 1,
    },
    'CONTROL_PANEL_ID': {
        '/checkPasscode': 1,
        '/setPasscode': 1,
        '/resetPasscode': 1,
        '/captureDeviceDetails': 1,
        '/checkOtpAuth': 1,
        '/getClientConf': 1,
        '/checkStatus': 1,
        '/file/uploadToSession': 1,
        '/checkBiometric': 1,
        '/recheckValidate': 1,
    },
    'NUBO_SETTINGS_ID': {
        '/checkPasscode': 1,
        '/setPasscode': 1,
        '/resetPasscode': 1,
        '/captureDeviceDetails': 1,
        '/checkOtpAuth': 1,
        '/resendOtpCode': 1,
        '/getClientConf': 1,
        '/checkStatus': 1,
        '/file/uploadToSession': 1,
        '/checkBiometric': 1,
        '/recheckValidate': 1,
    },
    'FRONTEND_AUTH': {
        '/SmsNotification/sendSmsNotification': 1,
        '/Notifications/pushNotification': 1,
        '/receiveSMS': 1,
        '/loginWebAdmin': 1,
        '/api/auth': 1,
        '/api/auth/activate': 1,
        '/api/auth/validate': 1,
        '/api/auth/reset': 1,
    },
    'WEB_ADMIN_TOKEN': {
        '/Notifications/pushNotification': 1
    }

};


function getExcludeList() {
    const Common = require('./common');
    const _ = require('underscore');
    if (Common.isEnterpriseEdition()) {
        const entExcludes = Common.getEnterprise().parametersMap.getAuthFilterExcludes();
        _.extend(excludeList['ISADMIN'],entExcludes['ISADMIN']);
        _.extend(excludeList['SESSID'],entExcludes['SESSID']);
        _.extend(excludeList['PLATUID'],entExcludes['PLATUID']);
        _.extend(excludeList['CONTROL_PANEL_ID'],entExcludes['CONTROL_PANEL_ID']);
        _.extend(excludeList['NUBO_SETTINGS_ID'],entExcludes['NUBO_SETTINGS_ID']);
        _.extend(excludeList['FRONTEND_AUTH'],entExcludes['FRONTEND_AUTH']);
        _.extend(excludeList['LOGINTOKEN'],entExcludes['LOGINTOKEN']);
    }
    if (Common.isMobile()) {
        const mExcludes = Common.getMobile().parametersMap.getAuthFilterExcludes();
        _.extend(excludeList['ISADMIN'],mExcludes['ISADMIN']);
        _.extend(excludeList['SESSID'],mExcludes['SESSID']);
        _.extend(excludeList['PLATUID'],mExcludes['PLATUID']);
        _.extend(excludeList['CONTROL_PANEL_ID'],mExcludes['CONTROL_PANEL_ID']);
        _.extend(excludeList['NUBO_SETTINGS_ID'],mExcludes['NUBO_SETTINGS_ID']);
        _.extend(excludeList['FRONTEND_AUTH'],mExcludes['FRONTEND_AUTH']);
        _.extend(excludeList['LOGINTOKEN'],mExcludes['LOGINTOKEN']);
    }


    for (var key in settingsList) {
        excludeList['ISADMIN'][key] = settingsList[key];
        excludeList['LOGINTOKEN'][key] = settingsList[key];
        excludeList['PLATUID'][key] = settingsList[key];
        excludeList['FRONTEND_AUTH'][key] = settingsList[key];
    }

    for (var key in controlPanelList) {
        excludeList['LOGINTOKEN'][key] = controlPanelList[key];
        excludeList['PLATUID'][key] = controlPanelList[key];
        excludeList['NUBO_SETTINGS_ID'][key] = controlPanelList[key];
        excludeList['FRONTEND_AUTH'][key] = controlPanelList[key];
        excludeList['WEB_ADMIN_TOKEN'][key] = controlPanelList[key];
    }

    for (var key in noFilterList) {
        excludeList['LOGINTOKEN'][key] = noFilterList[key];
        excludeList['PLATUID'][key] = noFilterList[key];
        excludeList['ISADMIN'][key] = noFilterList[key];
        excludeList['SESSID'][key] = noFilterList[key];

    }

    for (var key in webClientList) {
        excludeList['LOGINTOKEN'][key] = webClientList[key];
        excludeList['SESSID'][key] = webClientList[key];
        excludeList['ISADMIN'][key] = webClientList[key];
        excludeList['PLATUID'][key] = webClientList[key];
        excludeList['FRONTEND_AUTH'][key] = webClientList[key];
    }

    for (var key in gatewayList) {
        excludeList['SESSID'][key] = gatewayList[key];
        excludeList['ISADMIN'][key] = gatewayList[key];
        excludeList['LOGINTOKEN'][key] = gatewayList[key];
        excludeList['PLATUID'][key] = gatewayList[key];
        excludeList['CONTROL_PANEL_ID'][key] = gatewayList[key];
        excludeList['NUBO_SETTINGS_ID'][key] = gatewayList[key];
    }

    for (var key in feList) {
        excludeList['SESSID'][key] = feList[key];
        excludeList['ISADMIN'][key] = feList[key];
        excludeList['LOGINTOKEN'][key] = feList[key];
        excludeList['PLATUID'][key] = feList[key];
        excludeList['CONTROL_PANEL_ID'][key] = feList[key];
        excludeList['NUBO_SETTINGS_ID'][key] = feList[key];
    }

    for (var key in excludeList['SESSID']) {
        excludeList['CONTROL_PANEL_ID'][key] = excludeList['SESSID'][key];
        excludeList['NUBO_SETTINGS_ID'][key] = excludeList['SESSID'][key];
    }

    for (var key in excludeList['ISADMIN']) {
        excludeList['CONTROL_PANEL_ID'][key] = excludeList['ISADMIN'][key];
    }
    return excludeList;
}

// console.log(excludeList)

module.exports = {
    getExcludeList
};
