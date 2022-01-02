"use strict";

/*
 * @author Ori Sharon In this class we update the ad_sync under jobs to start immediately.
 */

var Common = require( '../common.js' );
var logger = Common.getLogger(__filename);

// first call goes to here
function runAdSync(req, res, domain) {
    // http://login.nubosoftware.com/runAdSync?session=[]
    res.contentType = 'json';
    var status = 1;
    var msg = "";

    if (status != 1) {
        res.send( {
            status : status,
            message : msg
        } );
        return;
    }

    runAdSyncImmediately(res, domain);

}

function runAdSyncImmediately(res, domain) {
    Common.db.Jobs.update({
        isupdate : 1,
        startimmediately : 1
    }, {
        where : {
            jobname : Common.adSync,
            maindomain : domain
        }
    }).then(function() {
        res.send({
            status : 1,
            message : "updated ad_sync successfully"
        });

    }).catch(function(err) {
        var errormsg = 'Error on updating ad_sync: ' + err;
        res.send({
            status : 0,
            message : err
        });
        return;
    });
}

var RunAdSync = {
    get : runAdSync
};

module.exports = RunAdSync;
