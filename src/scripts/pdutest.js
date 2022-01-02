
var pdu = require('node-pdu')
var Deliver = pdu.Deliver() // Submit, Deliver, Report

// set number of sms center (optional)
// Deliver.setSca('999999999999');

// set number of recipent (required)
Deliver.setAddress('+447492889207')

// set validity period 4 days (optional)
// Deliver.setVp(3600 * 24 * 4);

// set text of message (required)
Deliver.setData('Hello world')

// set status report request (optional, default is off)
// Deliver.getType().setSrr(1);

// get all parts of message
var parts = Deliver.getParts()

parts.forEach(function (part) {
  // part is object, instance of ./PDU/Data/Part, could be casted to string like ('' + part) or part.toString()
  console.log('Part: ' + part.toString())
})
