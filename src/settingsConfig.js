"use strict";

var fs = require('fs');
var file = 'Settings.json';
var argv = require('yargs/yargs')(process.argv.slice(2)).argv;

fs.readFile(file + ".template", 'utf8', function(err, data) {
    if (err) {
        console.log('Error in reading file: ' + err);
        return;
    }

    // parse the json into  object
    data = JSON.parse(data);

    // start receving arguments
    console.log('Starts updating ' + file.toString() + '...');
    if (argv.serverurl != null)
        data.serverurl = argv.serverurl;

    if (argv.redishost != null)
        data.redishost = argv.redishost;

    if (argv.redisport != null)
        data.redisport = argv.redisport;

    if (argv.cassandraHost != null)
        data.cassandraHost = argv.cassandraHost;

    if (argv.default_gateway != null)
        data.default_gateway = argv.default_gateway;

    if (argv.sessionTimeout != null)
        data.sessionTimeout = argv.sessionTimeout;

    if (argv.internal_gateway != null)
        data.internal_gateway = argv.internal_gateway;

    if (argv.hostline != null)
        data.hostline = argv.hostline;

    if (argv.adminEmail != null)
        data.adminEmail = argv.adminEmail;

    if (argv.adminName != null)
        data.adminName = argv.adminName;

    if (argv.platformType != null)
        data.platformType = argv.platformType;

    if (argv.sshPrivateKey != null)
        data.sshPrivateKey = argv.sshPrivateKey;

    if (argv.nfshomefolder != null)
        data.nfshomefolder = argv.nfshomefolder;

    if (argv.ssl_gateway != null)
        data.ssl_gateway = argv.ssl_gateway;

    if (argv.internal_network != null)
        data.internal_network = argv.internal_network;

    

    if (argv.dcName != null)
        data.dcName = argv.dcName;

    if (argv.demoActivationKey != null)
        data.demoActivationKey = argv.demoActivationKey;

    if (argv.isGeoIP != null)
        data.isGeoIP = argv.isGeoIP;

    if (argv.exchange_platformpath != null)
        data.exchange_platformpath = argv.exchange_platformpath;

    if (argv.iosPushUseSandbox != null)
        data.iosPushUseSandbox = argv.iosPushUseSandbox;

    if (argv.iosPushCertFile != null)
        data.iosPushCertFile = argv.iosPushCertFile;

    if (argv.iosPushKeyFile != null)
        data.iosPushKeyFile = argv.iosPushKeyFile;

    if (argv.trackURL != null)
        data.trackURL = argv.trackURL;

    // receive netsted awsConfig params
    var awsConfig = argv.awsConfig;
    if (awsConfig != null) {
        if (argv.awsConfig.accessKeyId != null)
            data.awsConfig.accessKeyId = argv.awsConfig.accessKeyId;

        if (argv.awsConfig.secretAccessKey != null)
            data.awsConfig.secretAccessKey = argv.awsConfig.secretAccessKey;

        if (argv.awsConfig.region != null)
            data.awsConfig.region = argv.awsConfig.region;
    }

    // receive netsted awsInstanceParams params
    var awsInstanceParams = argv.awsInstanceParams;
    if (awsInstanceParams != null) {

        if (argv.awsInstanceParams.ImageId != null)
            data.awsInstanceParams.ImageId = argv.awsInstanceParams.ImageId;

        if (argv.awsInstanceParams.MaxCount != null)
            data.awsInstanceParams.MaxCount = argv.awsInstanceParams.MaxCount;

        if (argv.awsInstanceParams.MinCount != null)
            data.awsInstanceParams.MinCount = argv.awsInstanceParams.MinCount;

        if (argv.awsInstanceParams.DisableApiTermination != null)
            data.awsInstanceParams.DisableApiTermination = argv.awsInstanceParams.DisableApiTermination;

        if (argv.awsInstanceParams.DryRun != null)
            data.awsInstanceParams.DryRun = argv.awsInstanceParams.DryRun;

        if (argv.awsInstanceParams.EbsOptimized != null)
            data.awsInstanceParams.EbsOptimized = argv.awsInstanceParams.EbsOptimized;

        if (argv.awsInstanceParams.InstanceInitiatedShutdownBehavior != null)
            data.awsInstanceParams.InstanceInitiatedShutdownBehavior = argv.awsInstanceParams.InstanceInitiatedShutdownBehavior;

        if (argv.awsInstanceParams.InstanceType != null)
            data.awsInstanceParams.InstanceType = argv.awsInstanceParams.InstanceType;

        var networkInterfaces = argv.awsInstanceParams.NetworkInterfaces;
        if (networkInterfaces != null) {

            if (argv.awsInstanceParams.NetworkInterfaces.DeviceIndex != null)
                data.awsInstanceParams.NetworkInterfaces[0].DeviceIndex = argv.awsInstanceParams.NetworkInterfaces.DeviceIndex;

            if (argv.awsInstanceParams.NetworkInterfaces.SubnetId != null)
                data.awsInstanceParams.NetworkInterfaces[0].SubnetId = argv.awsInstanceParams.NetworkInterfaces.SubnetId;

            if (argv.awsInstanceParams.NetworkInterfaces.AssociatePublicIpAddress != null)
                data.awsInstanceParams.NetworkInterfaces[0].AssociatePublicIpAddress = argv.awsInstanceParams.NetworkInterfaces.AssociatePublicIpAddress;

            if (argv.awsInstanceParams.NetworkInterfaces.Groups != null)
                data.awsInstanceParams.NetworkInterfaces[0].Groups[0] = argv.awsInstanceParams.NetworkInterfaces.Groups;
        }

        var placement = argv.awsInstanceParams.Placement;
        if (placement != null) {
            if (argv.awsInstanceParams.Placement.AvailabilityZone != null)
                data.awsInstanceParams.Placement.AvailabilityZone = argv.awsInstanceParams.Placement.AvailabilityZone;

            if (argv.awsInstanceParams.Placement.GroupName != null)
                data.awsInstanceParams.Placement.GroupName = argv.awsInstanceParams.Placement.GroupName;

            if (argv.awsInstanceParams.Placement.Tenancy != null)
                data.awsInstanceParams.Placement.Tenancy = argv.awsInstanceParams.Placement.Tenancy;
        }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log('Finished updating ' + file.toString() + '...');
});

