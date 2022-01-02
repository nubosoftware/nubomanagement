const Common = require('./common.js');
const logger = Common.getLogger(__filename);
let argv = process.argv.slice(2);
let cmd = argv.shift();
let a;
if (cmd) a = cmd.split("/");
if (!a || a.length < 2) {
  console.log(`Usage: ${process.argv[1]} module/script <arguments>`);
  return;
}
let m = a[0];
let s = a[1];
console.log(`Module ${m}, Script: ${s}, argv: ${argv}`);


Common.loadCallback = function (err, firstTime) {
  if (err) {
    console.log("Error: " + err);
    Common.quit();
    return;
  }
  if (!firstTime) return;

  let mod;
  if (m == "mobile") {
    mod = Common.getMobile();
  } else if (m == "enterprise") {
    mod = Common.getEnterprise()
  } else {
    console.log(`Module ${m} not found.`);
    Common.quit();
    return;
  }
  let res = mod.exec(s,argv);
  if (!res) {
    Common.quit();
  }
}