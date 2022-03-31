var execFile = require('child_process').execFile;
var _ = require('underscore');

var redHatExec = {
    PIDOF: "/sbin/pidof",
    TOUCH: "/bin/touch"
};

var ubuntuExec = {
    PIDOF: "/bin/pidof",
    TOUCH: "/usr/bin/touch"
};

var exec = {

    RM: "/bin/rm",
    KILL: "/bin/kill",
    PS: "/bin/ps",
    CHMOD: "/bin/chmod",
    NODE: "/usr/bin/node",
    SSH: "/usr/bin/ssh",
    PERL: "/usr/bin/perl",
    GREP: "/bin/grep",
    CHOWN: "/bin/chown",
    TAR: "/bin/tar",
    RSYNC: "/usr/bin/rsync",
    DIFF: "/usr/bin/diff",
    DU: "/usr/bin/du",
    CURL: "/usr/bin/curl",
    MOUNT: "/bin/mount",
    UMOUNT: "/bin/umount",
    MKDIR: "/bin/mkdir",
    CP: "/bin/cp",
    LS: "/bin/ls",
    MV: "/bin/mv"
};

var devExec = {
    NODE: "node"
}

var rhDistributes = [
    "CentOS",
    "RedHatEnterprise",
    "RedHatEnterpriseServer"
];


async function getGlobals() {
    let os = "unknown";
    const fsp = require('fs').promises;
    try {
        let osRelease = await fsp.readFile('/etc/os-release', "utf8");
        let lines = osRelease.split("\n");
        for (const line of lines) {
            let vals = line.split("=");
            if (vals[0]=="ID") {
                os = vals[1];
                break;
            }
        }
    } catch (err) {
        console.error(`Error reading /etc/os-release`,err);
    }
    console.log(`OS: ${os}`);
    if (os == "ubuntu") {
        return _.extend(exec, ubuntuExec);
    } else if (os == "rhel" || os == "centos") {
        return _.extend(exec, redHatExec);
    } else if (os == "alpine") {
        return _.extend(exec, devExec);
    } else {
        return _.extend(exec, devExec);
    }

}

/*function getGlobalsOld(callback) {

    execFile('/usr/bin/lsb_release', ['-i'], function(error, stdout, stderr) {
        if (error) {
            console.log(`lsb_release error: ${error}`);
            callback(null,_.extend(exec, devExec));
            return;
        }

        var re = new RegExp('[Distributor ID:\t]([a-zA-Z]*)\n');
        var m = re.exec(stdout);

        if (m[1] === 'Ubuntu') {
            return callback(null, _.extend(exec, ubuntuExec));
        } else if (rhDistributes.indexOf(m[1]) !== -1) {
            return callback(null, _.extend(exec, redHatExec));
        } else {
            console.log(`uknown linux distribution: ${m[1]}`);
            callback(null,_.extend(exec, ubuntuExec));
            //return callback('uknown linux distribution');
        }
    });
}*/


module.exports = {
    getGlobals: getGlobals
};
