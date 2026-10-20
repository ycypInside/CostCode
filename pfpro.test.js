const pf = require("./pfpro.js");
const result = pf.selfCheck();
const failed = result.cases.filter((item) => !item.ok);
if (failed.length) {
  failed.forEach((item) => {
    console.error("FAIL", item.name, item.detail || "");
  });
  console.error(failed.length + " failed / " + result.cases.length);
  process.exit(1);
}
console.log(result.cases.length + " checks passed");
