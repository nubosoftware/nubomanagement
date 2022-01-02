var Common = require('./common.js');
var logger = Common.getLogger(__filename);

// read only journal from gateway and report to DB
function readOnlineJournal() {
    var now = new Date();
    var currentDate = new Date(now.getTime());
    Common.redisClient.lpop('online_journal', function(err, reply) {
        if (err || !reply) {
            if (err)
                logger.error("readOnlineJournal - Error in BLPOP: " + err);
        } else {
            var splitedReply = reply.split("_");
            if (splitedReply.length != 2) {
                logger.error("readOnlineJournal: Error  - length " + splitedReply.length);
                logger.error("readOnlineJournal: Error  - activation key contains an unallowed character");
            } else {
                //write to db

                Common.db.Activation.update({
                    onlinestatus : parseInt(splitedReply[1], 10),
                    lasteventtime : currentDate,
                    lasteventdcname : Common.dcName
                }, {
                    where : {
                        activationkey : splitedReply[0]
                    }
                }).then(function() {

                }).catch(function(err) {
                    logger.error("readOnlineJournal: Error write to db " + err);
                });

            }
        }
        var timeout = ( reply ? 100 : 1000);
        setTimeout(readOnlineJournal, timeout);
    });
}

setTimeout(readOnlineJournal, 5000);
