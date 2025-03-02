"use strict";

var Sequelize = require('sequelize');


function initSequelize(dbname, user, password, host, port, options, callback,upgradeOnly) {
    var db = {};
    var callbackDone = false;
    var sequelizeLogs = options.sequelizeLogs ? options.sequelizeLogs : false;
    var dbMaxConnections = options.dbMaxConnections ? options.dbMaxConnections : 10;
    var dbMaxIdleTime = options.dbMaxIdleTime ? options.dbMaxIdleTime : 30;

    // connect to mySQL
    var sequelize = new Sequelize(dbname, user, password, {
        host: host,
        dialect: "mysql",
        port: port,
        logging: sequelizeLogs,
        pool: {
            maxConnections: dbMaxConnections,
            maxIdleTime: dbMaxIdleTime
        }
    });

    // authentication to mySQL
    sequelize.authenticate().then(function(err) {
        // console.log('Connection to mySQL has been established successfully.');
        if (!callbackDone) {
            callbackDone = true;
            //scheckLicense(db);
            callback(null, db, sequelize);
        }
    }, function(err) {
        // console.log('Unable to connect to mySQL database:', err);
        if (!callbackDone) {
            callbackDone = true;
            callback(err);
        }
    });

    // define Version Object
    db.Version = sequelize.define('versions', {
        version: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        time: Sequelize.DATE
    }, {
        timestamps: false
    });

    if (upgradeOnly) {
        console.log("initSequelize upgrade only!")
        return;
    }

    // define User Object
    db.User = sequelize.define('users', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        username: Sequelize.STRING,
        displayname: Sequelize.STRING,
        authtype: Sequelize.STRING,
        country: Sequelize.STRING,
        encrypted: Sequelize.INTEGER,
        firstname: Sequelize.STRING,
        imageurl: Sequelize.STRING,
        isactive: Sequelize.INTEGER,
        isadmin: Sequelize.INTEGER,
        jobtitle: Sequelize.STRING,
        lastname: Sequelize.STRING,
        orgdomain: Sequelize.STRING,
        addomain: Sequelize.STRING,
        orgemail: Sequelize.STRING,
        loginemailtoken: Sequelize.STRING,
        lastupdate: Sequelize.DATE,
        orgkey: Sequelize.STRING,
        orgpassword: Sequelize.STRING,
        orgpasswordcache: Sequelize.STRING,
        orguser: Sequelize.STRING,
        passcode: Sequelize.STRING,
        passcodeupdate: Sequelize.DATE,
        passcodetypechange: Sequelize.INTEGER,
        passcodetypeprev: Sequelize.INTEGER,
        securessl: Sequelize.STRING,
        serverurl: Sequelize.STRING,
        signature: Sequelize.STRING,
        manager: Sequelize.STRING,
        officephone: Sequelize.STRING,
        mobilephone: Sequelize.STRING,
        language: Sequelize.STRING,
        countrylang: Sequelize.STRING,
        localevar: Sequelize.STRING,
        clientport: Sequelize.STRING,
        clientip: Sequelize.STRING,
        im_mobile: Sequelize.STRING,
        im_mobile2: Sequelize.STRING,
        im_mobile_swap: Sequelize.STRING,
        im_mobile2_swap: Sequelize.STRING,
        adsync: Sequelize.STRING,
        status: Sequelize.STRING,
        im_verification_code: Sequelize.STRING,
        im_verification_code2: Sequelize.STRING,
        im_verification_status: Sequelize.INTEGER,
        subscriptionid: Sequelize.STRING,
        subscriptionupdatedate: Sequelize.DATE,
        isimadmin: Sequelize.INTEGER,
        storageLimit: Sequelize.FLOAT, //storage quotes for user's files in kB
        storageLast: Sequelize.FLOAT, //storage usage after last logout in kB
        dcname: Sequelize.STRING,
        dcurl: Sequelize.STRING,
        im_authenticate: Sequelize.STRING,
        enablesound: Sequelize.INTEGER,
        enablevibrate: Sequelize.INTEGER,
        lastactivity: Sequelize.STRING,
        last_im_time: Sequelize.STRING,
        passcodesalt: Sequelize.STRING,
        ldap_dn: Sequelize.STRING,
        exchange_domain: Sequelize.STRING,
        docker_image: Sequelize.STRING,
        recording: Sequelize.INTEGER,
    }, {
        timestamps: false
    });


    db.Admin = sequelize.define('admins', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING,
        permissions: Sequelize.TEXT,
    });

    db.User.hasOne(db.Admin, {foreignKey: 'email'});
    db.Admin.belongsTo(db.User, {foreignKey: 'email'});



    // define Activation Object
    db.Activation = sequelize.define('activations', {
        activationkey: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING,
        deviceid: Sequelize.STRING,
        devicetype: Sequelize.STRING,
        email: Sequelize.STRING,
        emailtoken: Sequelize.STRING,
        firstlogin: Sequelize.INTEGER,
        firstname: Sequelize.STRING,
        jobtitle: Sequelize.STRING,
        lastname: Sequelize.STRING,
        pushregid: Sequelize.STRING,
        resetpasscode: Sequelize.INTEGER,
        status: Sequelize.INTEGER,
        createdate: Sequelize.DATE,
        expirationdate: Sequelize.DATE,
        onlinestatus: Sequelize.INTEGER,
        lasteventtime: Sequelize.DATE,
        lasteventdcname: Sequelize.STRING,
        secondAuthRegistred: Sequelize.STRING,
        phone_number: Sequelize.STRING,
        imsi: Sequelize.STRING,
        devicename: Sequelize.STRING,
        resetpasscode_wipe: Sequelize.INTEGER,
        biometric_token: Sequelize.STRING,
        otp_token: Sequelize.STRING,
        deviceapprovaltype: Sequelize.INTEGER,
        public_key: Sequelize.TEXT,
    }, {
        timestamps: false
    });

    // define Orgs Object
    db.Orgs = sequelize.define('orgs', {
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        authtype: Sequelize.STRING,
        orgname: Sequelize.STRING,
        securessl: Sequelize.STRING,
        serverurl: Sequelize.STRING,
        signature: Sequelize.STRING,
        accessstatus: {
            type: Sequelize.STRING,
            defaultValue: "open"
        },
        passcodeexpirationdays: Sequelize.INTEGER,
        passcodeminchars: Sequelize.INTEGER,
        passcodetype: Sequelize.INTEGER,
        clientauthtype: Sequelize.INTEGER, // 0 - none, 1 - password only , 2 - biometric/otp only , 3 - password + biometric/otp
        secondauthmethod: Sequelize.INTEGER, // 1 - biometric only, 2 - otp only, 3 - biometric or otp
        otptype: Sequelize.INTEGER, // 0 - TOTP, 1 - SMS
        watermark: Sequelize.STRING,
        recordingall: Sequelize.INTEGER, // enable recording to all users
        recordingretentiondays: Sequelize.INTEGER, // number of days to keep recordings
        im_phone_verification_needed: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },
        impersonationpassword: Sequelize.STRING,
        impersonationuser: Sequelize.STRING,
        notifieradmin: Sequelize.STRING,
        deviceapprovaltype: Sequelize.INTEGER,
        allowdevicereg: Sequelize.INTEGER,
        exchangeencoding: {
            type: Sequelize.STRING,
            defaultValue: "UTF-8"
        },
        showfullnotif: Sequelize.INTEGER,
        dedicatedplatform: Sequelize.INTEGER,
        allowconnect: Sequelize.INTEGER,
        vpn: Sequelize.INTEGER,
        owaurl: Sequelize.STRING,
        owaurlpostauth: Sequelize.STRING,
        refererurl: Sequelize.STRING,
        inviteurl: Sequelize.STRING,
        admin_security_config: Sequelize.STRING,
    }, {

        timestamps: false
    });



    // define Apps Object
    db.Apps = sequelize.define('apps', {
        packagename: {
            type : Sequelize.STRING,
            primaryKey : true
        },
        apptype: Sequelize.STRING,
        filename: Sequelize.STRING,
        base_image_app: Sequelize.INTEGER,
        versionname : Sequelize.STRING,
        versioncode : Sequelize.STRING,
        appname : Sequelize.STRING,
        displayprotocol: Sequelize.INTEGER, // 0 - Auto detect, 1 - Server-rendering, 2 - Client-rendering, 3- Server-rendering ios only
        description : Sequelize.STRING,
        summary: Sequelize.STRING,
        categories: Sequelize.STRING,
        imageurl : Sequelize.STRING,
        maindomain : {
            type : Sequelize.STRING,
            primaryKey : true
        },
        price : Sequelize.STRING,
        status : Sequelize.INTEGER,
        err : Sequelize.STRING
    }, {
        timestamps: true
    });

    // define Devices Object
    db.Devices = sequelize.define('devices', {
        devicename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        resolution: Sequelize.STRING
    }, {
        timestamps: false
    });

    // define Groups Object
    db.Groups = sequelize.define('groups', {
        groupname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        status: Sequelize.STRING,
        type: Sequelize.STRING,
        adsync: Sequelize.STRING,
        distinguishedname: Sequelize.STRING,
        recording: Sequelize.INTEGER,
    }, {
        timestamps: false
    });



    // define GroupApps Object
    db.GroupApps = sequelize.define('group_apps', {
        groupname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        auto_install: Sequelize.INTEGER
    }, {
        timestamps: false
    });
    // define UserApps Object
    db.UserApps = sequelize.define('user_apps', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        enablehidenuboapp: Sequelize.INTEGER,
        private: Sequelize.INTEGER,
        auto_install: Sequelize.INTEGER
    }, {
        timestamps: false
    });

    db.User.hasMany(db.UserApps, {foreignKey: 'email'});
    db.UserApps.belongsTo(db.User, {foreignKey: 'email'});



    // define UserDevices Object
    db.UserDevices = sequelize.define('user_devices', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        imei: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        active: Sequelize.INTEGER,
        maindomain: Sequelize.STRING,
        devicename: Sequelize.STRING,
        inserttime: Sequelize.DATE,
        imsi: Sequelize.STRING,
        loginattempts: Sequelize.INTEGER,
        gateway: Sequelize.STRING,
        platform: Sequelize.STRING,
        localid: Sequelize.INTEGER,
        active_session: Sequelize.INTEGER,
        vpnprofilename: Sequelize.STRING,
        vpnstate: Sequelize.INTEGER,
        vpnclient: Sequelize.STRING,
        reg_phone_number: Sequelize.STRING,
        local_extension: Sequelize.STRING,
        assigned_phone_number: Sequelize.STRING,
        sip_username : Sequelize.STRING,
        sip_domain : Sequelize.STRING,
        sip_password : Sequelize.STRING,
        sip_port : Sequelize.INTEGER,
        sip_protocol : Sequelize.STRING,
        sip_proxy : Sequelize.STRING,
        region_code: Sequelize.STRING,
        messaging_server: Sequelize.STRING,
        messaging_token_type: Sequelize.STRING,
        last_login: Sequelize.DATE,
        session_cache_params: Sequelize.TEXT
    }, {
        timestamps: false
    });

    db.User.hasMany(db.UserDevices, {foreignKey: 'email'});
    db.UserDevices.belongsTo(db.User, {foreignKey: 'email'});



    // define UserGroups Object
    db.UserGroups = sequelize.define('user_groups', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        groupname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        adsync: Sequelize.STRING,
        status: Sequelize.STRING,
    }, {
        timestamps: false
    });



    // define AdFieldMapping Object
    db.AdFieldMapping = sequelize.define('ad_field_mappings', {
        adfield: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        nubofield: {
            type: Sequelize.STRING,
            primaryKey: true
        }
    }, {
        timestamps: false
    });

    // define DeviceApps Object
    db.DeviceApps = sequelize.define('device_apps', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        deviceid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        hrtime: Sequelize.BIGINT,
        maindomain: Sequelize.STRING,
        time: Sequelize.BIGINT,
        installed: Sequelize.INTEGER,
        filename: Sequelize.STRING,
    }, {
        timestamps: false
    });


    // define EventsLog Object
    db.EventsLog = sequelize.define('events_logs', {
        eventtype: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        extrainfo: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        time: {
            type: Sequelize.DATE,
            primaryKey: true
        },
        level: Sequelize.STRING
    }, {
        timestamps: false
    });

    // define SessionHistory
    db.SessionHistory = sequelize.define('session_history', {
        session_id: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        email: Sequelize.STRING,
        device_id:Sequelize.STRING,
        maindomain: Sequelize.STRING,
        devicename: Sequelize.STRING,
        start_time: Sequelize.DATE,
        end_time: Sequelize.DATE,
        platform: Sequelize.INTEGER,
        gateway:  Sequelize.INTEGER,
        active_seconds: Sequelize.INTEGER,
    }, {
        timestamps: false,
        freezeTableName: true
    });

    db.User.hasMany(db.SessionHistory, {foreignKey: 'email'});
    db.SessionHistory.belongsTo(db.User, {foreignKey: 'email'});

    // define SessionHistory
    db.SessionRecordings = sequelize.define('session_recordings', {
        session_id: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING,
        start_time: {
            type: Sequelize.DATE,
            primaryKey: true
        },
        end_time: Sequelize.DATE,
        active_seconds: Sequelize.INTEGER,
        file_name: Sequelize.STRING,
    }, {
        timestamps: false,
        freezeTableName: true
    });

    db.SessionHistory.hasMany(db.SessionRecordings, {foreignKey: 'session_id'});
    db.SessionRecordings.belongsTo(db.SessionHistory, {foreignKey: 'session_id'});

    // define Firewalls
    db.Firewall = sequelize.define('firewalls', {
        maindomain: {
            type: Sequelize.STRING
        },
        firewall_id: {
            autoIncrement: true,
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        firewall_name: Sequelize.STRING,
    }, {
        timestamps: false,
        freezeTableName: true
    });

    // define FirewallRules
    db.FirewallRule = sequelize.define('firewall_rules', {
        maindomain: {
            type: Sequelize.STRING
        },
        firewall_id: {
            type: Sequelize.INTEGER
        },
        rule_id: {
            autoIncrement: true,
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        destination: Sequelize.STRING,
        prot: Sequelize.STRING,
        dport: Sequelize.INTEGER,
        description: Sequelize.STRING,
    }, {
        timestamps: false,
        freezeTableName: true
    });

    db.Firewall.hasMany(db.FirewallRule, {foreignKey: 'firewall_id'});
    db.FirewallRule.belongsTo(db.Firewall, {foreignKey: 'firewall_id'});

    // define FirewallUsers
    db.FirewallUser = sequelize.define('firewall_users', {
        maindomain: {
            type: Sequelize.STRING
        },
        firewall_id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
    }, {
        timestamps: false,
        freezeTableName: true
    });

    db.Firewall.hasMany(db.FirewallUser, {foreignKey: 'firewall_id'});
    db.FirewallUser.belongsTo(db.Firewall, {foreignKey: 'firewall_id'});
    db.User.hasMany(db.FirewallUser, {foreignKey: 'email'});
    db.FirewallUser.belongsTo(db.User, {foreignKey: 'email'});

    // define Firewalls
    db.FirewallGroup = sequelize.define('firewall_groups', {
        maindomain: {
            type: Sequelize.STRING
        },
        firewall_id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        groupname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
    }, {
        timestamps: false,
        freezeTableName: true
    });

    db.Firewall.hasMany(db.FirewallGroup, {foreignKey: 'firewall_id'});
    db.FirewallGroup.belongsTo(db.Firewall, {foreignKey: 'firewall_id'});





    // define Ldap Object
    db.Ldap = sequelize.define('ldaps', {
        maindomain : {
            type : Sequelize.STRING,
            primaryKey : true
        },
        addomain : {
            type : Sequelize.STRING,
            primaryKey : true
        },
        basedn : Sequelize.STRING,
        connectionurl : Sequelize.STRING,
        password : Sequelize.STRING,
        username : Sequelize.STRING,
        adminemail : Sequelize.STRING,
        orgunits : Sequelize.STRING
    }, {
        timestamps: false
    });

    // define app_rules Object
    db.AppRules = sequelize.define('app_rules', {
        ruleid: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        packagename: Sequelize.STRING,
        ip: Sequelize.STRING,
        port: Sequelize.STRING,
        protocol: Sequelize.STRING,
        mask: Sequelize.STRING,
        ipversion: Sequelize.STRING,
    }, {
        timestamps: false
    });

    // define muc users Object
    db.mucUsers = sequelize.define('muc_users', {
        roomjid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        userjid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        }
    }, {
        timestamps: false
    });

    // define muc users Object
    db.webFiles = sequelize.define('web_files', {
        filename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        tojid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        addeddate: {
            type: Sequelize.STRING,
            primaryKey: false
        },
        refcount: {
            type: Sequelize.INTEGER,
            primaryKey: false
        }
    }, {
        timestamps: false
    });


    //define Ldap Object
    db.UserApplicationNotifs = sequelize.define('user_application_notifs', {
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        appname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        sendnotif: Sequelize.INTEGER
    }, {
        timestamps: false
    });


    // define jobs Object
    db.Jobs = sequelize.define('jobs', {
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        jobname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        startimmediately: Sequelize.INTEGER,
        intervalstr: Sequelize.STRING,
        timezone: Sequelize.STRING,
        isactive: Sequelize.INTEGER,
        commandtorun: Sequelize.STRING,
        dcname: Sequelize.STRING,
        isupdate: Sequelize.INTEGER
    }, {
        timestamps: false
    });



    // define packages_list Object
    db.PackagesList = sequelize.define('packages_lists', {
        uid: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING,
        createdate: Sequelize.DATE
    }, {
        timestamps: false
    });


    // define uploadAPKHistory Object
    db.uploadAPKHistory = sequelize.define('upload_apk_histories', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        packagename: Sequelize.STRING,
    }, {
        timestamps: false
    });


    // define recordings Object
    db.Recordings = sequelize.define('recordings', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        sessionid: Sequelize.STRING,
        displayname: Sequelize.STRING,
        filename: Sequelize.STRING,
        startdate: Sequelize.DATE,
        devicename: Sequelize.STRING,
        height: Sequelize.STRING,
        width: Sequelize.STRING,
        duration: Sequelize.INTEGER
    }, {
        timestamps: false
    });


    // define blocked devices Object
    db.BlockedDevices = sequelize.define('blocked_devices', {
        ruleid: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        rulename: Sequelize.STRING,
        filtername: Sequelize.STRING,
        maindomain: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.AppUsage = sequelize.define('app_usages', {
        day: { type: Sequelize.DATE, primaryKey: true},
        email: { type: Sequelize.STRING, primaryKey: true},
        packagename: { type: Sequelize.STRING, primaryKey: true},
        count: Sequelize.INTEGER,
        seconds: Sequelize.INTEGER,
    }, {
        timestamps: false
    });

    // define URLLauncher apps Object
    db.URLLauncherApps = sequelize.define('urllauncher_apps', {
        url: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        domain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        apkname: Sequelize.STRING,
        appname: Sequelize.STRING,
        ssourl: Sequelize.STRING,
        status: Sequelize.INTEGER
    }, {
        timestamps: false
    });

    // define LastSessions apps Object
    db.LastSessions = sequelize.define('last_sessions', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        count: Sequelize.INTEGER,
        time: Sequelize.DATE,
        maindomain: Sequelize.STRING
    }, {
        timestamps: false
    });


    db.OpenVpnProfiles = sequelize.define('openvpn_profiles', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        user: Sequelize.STRING,
        profilename: Sequelize.STRING,
        configfile: Sequelize.BLOB,
        orgaccount: Sequelize.INTEGER,
        vpnusername: Sequelize.STRING,
        vpnpassword: Sequelize.STRING
    }, {
        timestamps: false
    });

    // define AppsVersions Object
    db.AppsVersions = sequelize.define('apps_versions', {
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        versioncode: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.UserNotificationsHistory = sequelize.define('user_notifications_history', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,

        },
        email: Sequelize.STRING,
        date: Sequelize.DATE,
        titleText: Sequelize.STRING,
        notifyTime: Sequelize.STRING,
        notifyLocation: Sequelize.STRING,
        appName: Sequelize.STRING
    }, {
        freezeTableName: true,
        timestamps: false
    });

    db.globalConfig = sequelize.define('global_configs', {
        name: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        value: Sequelize.STRING,
    }, {
        timestamps: false
    });


    db.dataCenterConfig = sequelize.define('data_center_configs', {
        dcName: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        name: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        value: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.platformConfig = sequelize.define('platform_configs', {
        dcName: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        poolStrategy: Sequelize.STRING,
        concurrency: Sequelize.INTEGER,
        concurrencyDelay: Sequelize.INTEGER,
        platformPoolSize: Sequelize.INTEGER,
        explatformPoolSize: Sequelize.INTEGER,
        upperCapacityLevel: Sequelize.FLOAT,
        bottomCapacityLevel: Sequelize.FLOAT,
        maxCapacity: Sequelize.INTEGER,
        usersPerPlatform: Sequelize.INTEGER,
        choosePool: Sequelize.INTEGER,
        maxFailed: Sequelize.INTEGER,
        maxFails: Sequelize.INTEGER,
        fixedPool: Sequelize.STRING,
        restartPlatformSessionsThreshold: Sequelize.INTEGER,
        cleanPlatformsMode: Sequelize.STRING,
        rsyslog: Sequelize.STRING
    }, {
        timestamps: false
    });



    db.orgRedirectionMap = sequelize.define('org_redirection_maps', {
        domain: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        url: Sequelize.STRING
    }, {
        timestamps: false
    });



    db.versionRedirectionMap = sequelize.define('version_redirection_maps', {
        version: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        url: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.AllowedFrontEndServers = sequelize.define('allowed_front_end_servers', {
        dcName: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        servername: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        serverkey: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.RemoteServers = sequelize.define('remote_servers', {
        servername: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        serverkey: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.Locks = sequelize.define('locks', {
        name: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        dcname: Sequelize.STRING,
        timeset: Sequelize.DATE,
        timeout: Sequelize.DATE
    }, {
        timestamps: false
    });

    db.DataCenters = sequelize.define('data_centers', {
        dcname: {
            type: Sequelize.STRING,
            primaryKey: true,
        },
        status: Sequelize.STRING,
        updatetime: Sequelize.DATE,
        users: Sequelize.BLOB('medium')
    }, {
        timestamps: false
    });

    db.NfsServers = sequelize.define('nfs_servers', {
        id: {
            autoIncrement: true,
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        dcname: Sequelize.STRING,
        nfsip: Sequelize.STRING,
        sship: Sequelize.STRING,
        sshuser: Sequelize.STRING,
        keypath: Sequelize.STRING,
        nfspath: Sequelize.STRING,
        nfspathslow: Sequelize.STRING
    }, {
        timestamps: false
    });

    db.WebclientAllowedSubnets = sequelize.define('webclient_allowed_subnets', {
        dcname: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        subnet: {
            type: Sequelize.STRING,
            primaryKey: true
        }
    }, {
        timestamps: false
    });

    db.PasscodeHistory = sequelize.define('passcode_history', {
        id: {
            autoIncrement: true,
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        email : Sequelize.STRING,
        passcode: Sequelize.STRING,
        maindomain: Sequelize.STRING,
        lastupdate : Sequelize.DATE
    }, {
        freezeTableName: true,
        timestamps : false
    });

    db.DeviceModelConvert = sequelize.define('device_model_convert', {
        hardwaredesc: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        devicemodel: {
            type: Sequelize.STRING,
            primaryKey: true
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });

    // define elfInstalledApps Object
    db.SelfInstalledApps = sequelize.define('self_installed_apps', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        deviceid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        packagename: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING
    }, {
        timestamps: true
    });

    db.Apks = sequelize.define('apks', {
        packagename: {
            type : Sequelize.STRING,
            primaryKey : true
        },
        versioncode : Sequelize.BIGINT,
        versionname : Sequelize.STRING,
        appname : Sequelize.STRING,
        is_in_image: Sequelize.INTEGER,
        can_be_updated: Sequelize.INTEGER

    });

    // define Images Object
    db.Images = sequelize.define('images', {
        maindomain : {
            type : Sequelize.STRING,
            primaryKey : true
        },
        image_name: {
            type : Sequelize.STRING,
            primaryKey : true
        },
        content_hash: Sequelize.STRING
    }, {
        timestamps: true
    });


    db.telphonySubsciptions = sequelize.define('telephony_subscriptions', {
        email: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        deviceid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        maindomain: Sequelize.STRING,
        provider: Sequelize.STRING,
        assigned_phone_number: Sequelize.STRING,
        sid: Sequelize.STRING
    }, {
        timestamps: true
    });

    db.TelphonyTrunks = sequelize.define('telephony_trunks', {
        trunkid: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        trunk_priority: Sequelize.INTEGER,
        provider: Sequelize.STRING,
        sip_proxy : Sequelize.STRING,
        sip_username : Sequelize.STRING,
        sip_domain : Sequelize.STRING,
        sip_password : Sequelize.STRING,
        sip_port : Sequelize.INTEGER,
        sip_protocol : Sequelize.STRING,
        outgoing_rule: Sequelize.STRING
    }, {
        timestamps: true
    });

    db.TelphonyLocalNumbers = sequelize.define('telephony_local_numbers', {
       local_number: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        is_used: Sequelize.INTEGER,
        maindomain: Sequelize.STRING,
        email: Sequelize.INTEGER,
        deviceid: Sequelize.STRING,
        vip_number: Sequelize.INTEGER
    }, {
        timestamps: false
    });

    /**
     * Store details of static platform - platforms that have dedicated ip address or vmanme
     */
    db.StaticPlatforms = sequelize.define('static_platforms', {
        platid: {
             type: Sequelize.INTEGER,
             primaryKey: true
         },
         ip: Sequelize.STRING,
         vmname: Sequelize.STRING,
         ssh_port: Sequelize.INTEGER,
         send_logs: Sequelize.INTEGER,
     }, {
         timestamps: false
     });

     db.Plugins = sequelize.define('plugins', {
        id: {
            type: Sequelize.STRING,
            primaryKey: true
        },
        version : Sequelize.STRING,
        name : Sequelize.STRING,
        description : Sequelize.TEXT,
        active: Sequelize.INTEGER,
        packagehash: Sequelize.INTEGER,
        configuration: Sequelize.TEXT('medium'),
        package: Sequelize.BLOB('long')
    }, {
        timestamps: true
    });

    db.ComponentVersions = sequelize.define('component_versions', {
        componentName: {
            type: Sequelize.STRING(50),
            primaryKey: true
        },
        componentIndex: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        version: Sequelize.STRING(50),
        buildTime: Sequelize.DATE
    }, {
        timestamps: true
    });




    //sequelize.sync();
}



module.exports = {
    initSequelize: initSequelize
};
