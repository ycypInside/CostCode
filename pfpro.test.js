const pf = require("./pfpro.js");
const result = pf.selfCheck();
const required = ["代墊拆帳", "代墊超過總額", "代墊沒有名字", "整筆代墊", "代墊類型", "朋友還錢", "代墊離線改金額", "已入帳代墊先作廢再重送", "busy 不立刻重試", "重試間隔", "帳戶快取 12 小時", "讀取逾時", "request_id 維持原樣", "快速連改用最新 txn", "重播拒絕不再重試", "卡住的 r3 遷移"];
required.forEach((name) => {
  if (!result.cases.some((item) => item.name === name && item.ok)) {
    console.error("FAIL missing", name);
    process.exit(1);
  }
});
const failed = result.cases.filter((item) => !item.ok);
if (failed.length) {
  failed.forEach((item) => {
    console.error("FAIL", item.name, item.detail || "");
  });
  console.error(failed.length + " failed / " + result.cases.length);
  process.exit(1);
}
console.log(result.cases.length + " checks passed");
