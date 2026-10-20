/* CostCode → PF Pro 寫入對照與組 payload。
   這支檔沒有祕密、沒有網址。瀏覽器以 <script> 載入；Node 用 require。
   改分類時只改 PF_MAP 這一張表。由上往下，第一條符合的規則生效。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PfPro = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  /* 財政 2026-10-20 定稿的支出 17 類。費用與收入不在這張清單裡。 */
  var PF_CATEGORIES = [
    "餐飲", "交通", "汽機車", "居家生活", "帳單繳費", "3C通訊", "服飾美容",
    "休閒娛樂", "旅遊", "醫療保健", "保險", "教育", "書報文具", "人情禮物",
    "寵物", "工作", "其他"
  ];

  /*
   * PF_MAP 欄位
   * mains   大類名稱，逗號分隔同義。"*" 不限大類。
   * subs    子類全名，逗號分隔。空白表示這條看大類（或只看 subHas）。
   * subHas  子類名稱含這些字即符合（儲值）。空白表示不使用。
   * action  expense | income | fee | block
   * category 寫進 PF Pro 的 category。block 留白。
   * note    擋下或特例時顯示給使用者。
   *
   * 子類規則要排在同大類的整類規則之前。
   */
  var PF_MAP = [
    { mains: "*", subs: "", subHas: "悠遊卡,一卡通,icash", action: "expense", category: "交通", note: "儲值當消費，不建儲值帳戶" },
    { mains: "日常家庭", subs: "壓歲錢", subHas: "", action: "expense", category: "人情禮物", note: "" },
    { mains: "健康醫療", subs: "保險", subHas: "", action: "expense", category: "保險", note: "只記保費" },
    { mains: "金融財經", subs: "轉帳", subHas: "", action: "block", category: "", note: "轉帳不是支出。繳信用卡請用「繳卡費」。" },
    { mains: "金融財經", subs: "手續費", subHas: "", action: "fee", category: "手續費", note: "" },
    { mains: "金融財經", subs: "樂透", subHas: "", action: "expense", category: "休閒娛樂", note: "" },
    { mains: "金融財經", subs: "其他", subHas: "", action: "block", category: "", note: "金融財經的「其他」要手動確認，這筆不寫入 PF Pro。" },
    { mains: "*", subs: "轉帳", subHas: "", action: "block", category: "", note: "轉帳不是支出。繳信用卡請用「繳卡費」。" },
    { mains: "*", subs: "手續費", subHas: "", action: "fee", category: "手續費", note: "" },
    { mains: "餐費", subs: "", subHas: "", action: "expense", category: "餐飲", note: "" },
    { mains: "交通費", subs: "", subHas: "", action: "expense", category: "交通", note: "" },
    { mains: "書報文具", subs: "", subHas: "", action: "expense", category: "書報文具", note: "" },
    { mains: "衣服美妝", subs: "", subHas: "", action: "expense", category: "服飾美容", note: "" },
    { mains: "休閒娛樂", subs: "", subHas: "", action: "expense", category: "休閒娛樂", note: "" },
    { mains: "繳費", subs: "", subHas: "", action: "expense", category: "帳單繳費", note: "" },
    { mains: "日常家庭", subs: "", subHas: "", action: "expense", category: "居家生活", note: "" },
    { mains: "汽機車", subs: "", subHas: "", action: "expense", category: "汽機車", note: "" },
    { mains: "健康醫療", subs: "", subHas: "", action: "expense", category: "醫療保健", note: "" },
    { mains: "旅遊", subs: "", subHas: "", action: "expense", category: "旅遊", note: "" },
    { mains: "金融財經", subs: "", subHas: "", action: "block", category: "", note: "請選子分類。轉帳不寫入；手續費記成 fee；樂透記休閒娛樂。" },
    { mains: "寵物", subs: "", subHas: "", action: "expense", category: "寵物", note: "" },
    { mains: "教育", subs: "", subHas: "", action: "expense", category: "教育", note: "" },
    { mains: "禮物", subs: "", subHas: "", action: "expense", category: "人情禮物", note: "" },
    { mains: "手機電腦", subs: "", subHas: "", action: "expense", category: "3C通訊", note: "" },
    { mains: "工作", subs: "", subHas: "", action: "expense", category: "工作", note: "" },
    { mains: "薪水獎金,薪資,薪水,投資,投資收入,轉帳", subs: "", subHas: "", action: "block", category: "", note: "薪資與投資由 PF Pro 銀行或交易端記，這裡不寫入。轉帳請用「繳卡費」。" }
  ];

  var BLOCK_NOTE = "薪資、投資不寫入 PF Pro。轉帳不是支出；繳信用卡請用「繳卡費」。";
  var PAY_TYPES = { cash_wallet: 1, credit_card: 1, bank_cash: 1, bank_fx: 1 };
  var AR_FRIENDS = "ACC-AR-FRIENDS";
  var AR_FRIENDS_NAME = "朋友代墊（應收）";

  function normName(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, "").toLowerCase();
  }

  function splitNames(value) {
    return String(value || "").split(",").map(normName).filter(Boolean);
  }

  function mainMatches(rule, mainName) {
    var names = splitNames(rule.mains);
    if (names.indexOf("*") >= 0) return true;
    return names.indexOf(normName(mainName)) >= 0;
  }

  function subListed(rule, subName) {
    var names = splitNames(rule.subs);
    if (!names.length) return false;
    return names.indexOf(normName(subName)) >= 0;
  }

  function subContains(rule, subName) {
    var keys = splitNames(rule.subHas);
    if (!keys.length) return false;
    var sub = normName(subName);
    if (!sub) return false;
    for (var i = 0; i < keys.length; i++) if (sub.indexOf(keys[i]) >= 0) return true;
    return false;
  }

  function isSubRule(rule) {
    return !!(String(rule.subs || "").trim() || String(rule.subHas || "").trim());
  }

  function findRule(mainName, subName) {
    var i;
    var rule;
    for (i = 0; i < PF_MAP.length; i++) {
      rule = PF_MAP[i];
      if (!isSubRule(rule) || !mainMatches(rule, mainName)) continue;
      if (subListed(rule, subName) || subContains(rule, subName)) return rule;
    }
    for (i = 0; i < PF_MAP.length; i++) {
      rule = PF_MAP[i];
      if (isSubRule(rule) || !mainMatches(rule, mainName)) continue;
      return rule;
    }
    return null;
  }

  function resolveCategory(mainName, subName, type) {
    var main = String(mainName || "").trim();
    var sub = String(subName || "").trim();
    var rule = findRule(main, sub);
    if (rule && rule.action === "block") {
      return { ok: false, action: "block", category: "", error: rule.note || BLOCK_NOTE, note: rule.note || "" };
    }
    if (rule) {
      return { ok: true, action: rule.action, category: rule.category, error: "", note: rule.note || "", mainName: main, subName: sub };
    }
    if (type === "income") {
      return { ok: true, action: "income", category: "其他收入", error: "", note: "非薪資收入記到其他收入", mainName: main, subName: sub };
    }
    return {
      ok: false,
      action: "block",
      category: "",
      error: "「" + (sub ? main + "›" + sub : main || "未選分類") + "」還沒對到 PF Pro。請改分類，或在 pfpro.js 的 PF_MAP 加一列。",
      note: ""
    };
  }

  function mainHidden(mainName) {
    var rule = null;
    var i;
    for (i = 0; i < PF_MAP.length; i++) {
      if (isSubRule(PF_MAP[i]) || !mainMatches(PF_MAP[i], mainName)) continue;
      rule = PF_MAP[i];
      break;
    }
    if (!rule || rule.action !== "block") return false;
    for (i = 0; i < PF_MAP.length; i++) {
      var subRule = PF_MAP[i];
      if (!isSubRule(subRule) || !mainMatches(subRule, mainName)) continue;
      if (splitNames(subRule.mains).indexOf("*") >= 0) continue;
      if (subRule.action !== "block") return false;
    }
    return true;
  }

  function subHidden(mainName, subName) {
    var decision = resolveCategory(mainName, subName, "expense");
    return !decision.ok;
  }

  function roundMoney(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function buildDescription(mainName, subName, memo, reimburse) {
    var text = "[CostCode] " + String(mainName || "").trim();
    var sub = String(subName || "").trim();
    if (sub) text += "›" + sub;
    var note = String(memo || "").trim().replace(/\s+/g, " ");
    if (note) text += " " + note;
    if (reimburse) text += " 待報帳";
    return text;
  }

  function planTx(input) {
    var src = input || {};
    var decision = resolveCategory(src.mainName, src.subName, src.type === "income" ? "income" : "expense");
    if (!decision.ok) return { ok: false, error: decision.error };
    if (!src.uid) return { ok: false, error: "缺少 uid" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.date || "")) return { ok: false, error: "請選擇日期" };
    if (!src.accountId) return { ok: false, error: "請選擇帳戶" };
    var currency = src.currency || "TWD";
    if (currency !== "TWD") return { ok: false, error: "PF Pro 快速記帳目前只寫台幣帳戶" };
    var amount = roundMoney(src.amount);
    if (!(amount > 0)) return { ok: false, error: "請輸入金額" };
    var txnType = decision.action === "fee" ? "fee" : (decision.action === "income" ? "income" : "expense");
    var signed = txnType === "income" ? amount : -amount;
    var reimburse = !!src.reimburse && decision.category === "工作";
    var data = {
      date: src.date,
      account_id: String(src.accountId),
      txn_type: txnType,
      category: decision.category,
      amount: signed,
      currency: "TWD",
      fx_rate: 1,
      fx_source: "actual",
      flow_class: "external",
      description: buildDescription(decision.mainName || src.mainName, decision.subName || src.subName, src.memo, reimburse)
    };
    return {
      ok: true,
      action: "add_transaction",
      requestId: "cc-" + src.uid,
      data: data,
      category: decision.category,
      txnType: txnType,
      note: decision.note || ""
    };
  }

  function planTransfer(input) {
    var src = input || {};
    if (!src.uid) return { ok: false, error: "缺少 uid" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.date || "")) return { ok: false, error: "請選擇日期" };
    if (!src.fromId || !src.toId) return { ok: false, error: "請選轉出銀行與轉入信用卡" };
    if (src.fromId === src.toId) return { ok: false, error: "轉出與轉入帳戶不能相同" };
    if (src.fromType && src.fromType !== "bank_cash" && src.fromType !== "bank_fx") return { ok: false, error: "繳卡費要從銀行帳戶轉出" };
    if (src.toType && src.toType !== "credit_card") return { ok: false, error: "請選信用卡帳戶" };
    var currency = src.currency || "TWD";
    if (currency !== "TWD" || (src.toCurrency && src.toCurrency !== "TWD")) return { ok: false, error: "繳卡費目前只處理台幣" };
    var amount = roundMoney(src.amount);
    if (!(amount > 0)) return { ok: false, error: "請輸入金額" };
    return {
      ok: true,
      action: "add_transfer",
      requestId: "cc-" + src.uid,
      data: {
        date: src.date,
        from: {
          account_id: String(src.fromId),
          amount: -amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        to: {
          account_id: String(src.toId),
          amount: amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        flow_class: "internal",
        description: buildDescription("繳卡費", "", src.memo, false)
      }
    };
  }

  function cents(value) {
    return Math.round(roundMoney(value) * 100);
  }

  function advanceItem(src) {
    var main = String(src.mainName || "").trim();
    var sub = String(src.subName || "").trim();
    var memo = String(src.memo || "").trim().replace(/\s+/g, " ");
    var cat = main && sub ? main + "›" + sub : main;
    return [cat, memo].filter(Boolean).join(" ");
  }

  function friendMemo(friendName, item) {
    return [String(friendName || "").trim(), String(item || "").trim()].filter(Boolean).join(" ");
  }

  function planAdvance(input) {
    var src = input || {};
    if (!src.uid) return { ok: false, error: "缺少 uid" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.date || "")) return { ok: false, error: "請選擇日期" };
    if (!src.accountId) return { ok: false, error: "請選擇帳戶" };
    if (String(src.accountId) === AR_FRIENDS) return { ok: false, error: "代墊要從現金、銀行或信用卡轉出" };
    if (src.accountType && !PAY_TYPES[src.accountType]) return { ok: false, error: "請選現金、銀行或信用卡" };
    var currency = src.currency || "TWD";
    if (currency !== "TWD") return { ok: false, error: "代墊目前只處理台幣" };
    var amount = roundMoney(src.amount);
    if (!(amount > 0)) return { ok: false, error: "請輸入代墊金額" };
    var friend = String(src.friendName || "").trim().replace(/\s+/g, " ");
    if (!friend) return { ok: false, error: "請填朋友名字" };
    return {
      ok: true,
      leg: "adv",
      uid: String(src.uid),
      action: "add_transfer",
      requestId: "cc-" + src.uid + "-adv",
      friendName: friend,
      amount: amount,
      data: {
        date: src.date,
        from: {
          account_id: String(src.accountId),
          amount: -amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        to: {
          account_id: AR_FRIENDS,
          amount: amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        flow_class: "internal",
        description: buildDescription("代墊", "", friendMemo(friend, src.item != null ? src.item : advanceItem(src)), false)
      }
    };
  }

  function planRepay(input) {
    var src = input || {};
    if (!src.uid) return { ok: false, error: "缺少 uid" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.date || "")) return { ok: false, error: "請選擇日期" };
    if (!src.toId) return { ok: false, error: "請選入帳的現金或銀行帳戶" };
    if (String(src.toId) === AR_FRIENDS) return { ok: false, error: "請選入帳的現金或銀行帳戶" };
    if (src.toType !== "cash_wallet" && src.toType !== "bank_cash" && src.toType !== "bank_fx") return { ok: false, error: "朋友還錢要進現金或銀行，不進信用卡" };
    var currency = src.currency || "TWD";
    if (currency !== "TWD") return { ok: false, error: "朋友還錢目前只處理台幣" };
    var amount = roundMoney(src.amount);
    if (!(amount > 0)) return { ok: false, error: "請輸入金額" };
    var friend = String(src.friendName || "").trim().replace(/\s+/g, " ");
    if (!friend) return { ok: false, error: "請填朋友名字" };
    return {
      ok: true,
      leg: "repay",
      uid: String(src.uid),
      action: "add_transfer",
      requestId: "cc-" + src.uid + "-repay",
      friendName: friend,
      amount: amount,
      data: {
        date: src.date,
        from: {
          account_id: AR_FRIENDS,
          amount: -amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        to: {
          account_id: String(src.toId),
          amount: amount,
          currency: "TWD",
          fx_rate: 1,
          fx_source: "actual"
        },
        flow_class: "internal",
        description: buildDescription("朋友還錢", "", friend, false)
      }
    };
  }

  function planSplit(input) {
    var src = input || {};
    var mode = src.mode === "advance" ? "advance" : (src.type === "income" ? "income" : "expense");
    var total = roundMoney(src.amount);
    if (!(total > 0)) return { ok: false, error: "請輸入金額" };
    var advance = mode === "advance" ? total : roundMoney(src.advance || 0);
    if (cents(advance) < 0) return { ok: false, error: "代墊金額不能是負的" };
    if (cents(advance) > cents(total)) return { ok: false, error: "代墊金額不能大於刷卡或付現的總額" };
    var mine = (cents(total) - cents(advance)) / 100;
    if (cents(mine) + cents(advance) !== cents(total)) return { ok: false, error: "我的份加上朋友的份必須等於刷卡或付現總額" };
    if (advance > 0 && mode === "income") return { ok: false, error: "代墊只用於支出" };
    var friend = String(src.friendName || "").trim().replace(/\s+/g, " ");
    if (advance > 0 && !friend) return { ok: false, error: "請填朋友名字" };
    var legs = [];
    if (mine > 0) {
      var minePlan = planTx(Object.assign({}, src, {
        type: mode === "income" ? "income" : "expense",
        amount: mine
      }));
      if (!minePlan.ok) return minePlan;
      minePlan.leg = "exp";
      if (advance > 0) minePlan.requestId = "cc-" + src.uid + "-exp";
      legs.push(minePlan);
    }
    if (advance > 0) {
      var adv = planAdvance(Object.assign({}, src, { amount: advance, friendName: friend }));
      if (!adv.ok) return adv;
      legs.push(adv);
    }
    return {
      ok: true,
      total: total,
      mine: mine,
      advance: advance,
      friendName: advance > 0 ? friend : "",
      wholeAdvance: advance > 0 && mine === 0,
      localAmount: mine,
      localType: mode === "income" ? "income" : "expense",
      legs: legs
    };
  }

  function normalizeAccounts(list) {
    return (list || []).map(function (row) {
      var id = row && (row.account_id || row.id) ? String(row.account_id || row.id) : "";
      return {
        id: id,
        name: String((row && row.name) || id || "帳戶"),
        type: String((row && row.type) || ""),
        currency: String((row && row.currency) || "TWD"),
        status: String((row && row.status) || "active"),
        institution: String((row && row.institution) || "")
      };
    }).filter(function (row) { return row.id; });
  }

  function isOpen(account) {
    return account && account.status !== "closed";
  }

  function isPayAccount(account) {
    return isOpen(account) && !!PAY_TYPES[account.type];
  }

  function payAccounts(list) {
    var rank = { cash_wallet: 0, bank_cash: 1, bank_fx: 2, credit_card: 3 };
    return normalizeAccounts(list).filter(isPayAccount).sort(function (a, b) {
      var byType = (rank[a.type] == null ? 9 : rank[a.type]) - (rank[b.type] == null ? 9 : rank[b.type]);
      if (byType) return byType;
      return a.name.localeCompare(b.name, "zh-Hant");
    });
  }

  function bankAccounts(list) {
    return payAccounts(list).filter(function (account) {
      return account.type === "bank_cash" || account.type === "bank_fx";
    });
  }

  function cardAccounts(list) {
    return payAccounts(list).filter(function (account) { return account.type === "credit_card"; });
  }

  function repayAccounts(list) {
    return payAccounts(list).filter(function (account) {
      return account.type === "cash_wallet" || account.type === "bank_cash" || account.type === "bank_fx";
    });
  }

  function hasFriendsAccount(list) {
    return normalizeAccounts(list).some(function (account) { return account.id === AR_FRIENDS; });
  }

  function endpointError(apiUrl, token) {
    var urlText = String(apiUrl || "").trim();
    var key = String(token || "").trim();
    if (!urlText || !key) return "請填 PF Pro 的 /exec 網址與 API key。";
    var url;
    try { url = new URL(urlText); }
    catch (error) { return "網址格式不正確。"; }
    if (url.protocol !== "https:") return "網址必須是 https。";
    if (url.username || url.password) return "不要把帳號密碼放在網址裡。";
    if (key.length < 8) return "API key 太短。";
    return "";
  }

  function withPostQuery(apiUrl, token) {
    var url = new URL(String(apiUrl || "").trim());
    url.searchParams.set("token", String(token == null ? "" : token));
    url.searchParams.set("m", "post");
    return url.toString();
  }

  var PF_GET_TIMEOUT_MS = 15000;
  var ACCOUNT_TTL_MS = 12 * 60 * 60 * 1000;

  function shouldRetryPost(payload, attempt) {
    if (attempt >= 2) return false;
    if (!payload || payload.ok) return false;
    var reason = String(payload.reason || "");
    if (reason === "mismatch" || reason === "missing_secret") return false;
    if (reason === "missing_token" || reason === "parse_error" || reason === "lost_body") return true;
    if (reason) return false;
    var error = String(payload.error || "");
    if (error.indexOf("V9") === 0) return false;
    if (error === "busy") return false;
    return error === "unauthorized" || error === "bad json" || error === "unknown q" || error === "parse_error" || error === "server";
  }

  function retryDelayMs(attempt) {
    var n = Math.max(0, Number(attempt) || 0);
    if (n === 0) return 0;
    return Math.min(8000, 400 * Math.pow(2, n - 1));
  }

  function accountCacheFresh(savedAt, now) {
    var at = Number(savedAt);
    var clock = Number(now);
    if (!at || !clock || clock < at) return false;
    return clock - at < ACCOUNT_TTL_MS;
  }

  function explainError(message, reason) {
    var text = String(message || "").trim();
    var why = String(reason || "").trim();
    if (!text) return "發生錯誤";
    if (text === "unauthorized" && why === "mismatch") return "API key 與 PF Pro 不一致。";
    if (text === "unauthorized" && why === "missing_token") return "這次送出沒有帶到 API key。";
    if (text === "unauthorized") return "API key 不正確。";
    if (text === "auth_unavailable") return "PF Pro 暫時讀不到 API key。這不是密碼錯誤，請再試一次。";
    if (text === "busy") return "PF Pro 正在寫入，請稍後再試。";
    if (text === "server") return "PF Pro 暫時沒有回應。";
    if (why === "lost_body" || text === "parse_error") return "送出的內容在轉址時遺失。已沿用同一個 request_id 重試。";
    if (text.indexOf("V9") === 0) return "這筆的 request_id 已經用過，而且內容不一樣。請不要改舊的 request_id。";
    return text;
  }

  function txnIdFromResponse(json) {
    if (!json || typeof json !== "object") return "";
    var result = json.result && typeof json.result === "object" ? json.result : {};
    var ids = result.ids || json.ids || [];
    if (ids.length && ids[0]) return String(ids[0]);
    var ref = json.result_ref || result.result_ref || "";
    if (!ref) return "";
    return String(ref).split(",")[0];
  }

  function replaceBody(txnId, data) {
    return { txn_id: txnId, void_reason: "CostCode 修改", data: data };
  }

  function queueWrite(queue, entry) {
    var rest = [];
    var pending = null;
    (queue || []).forEach(function (op) {
      if (op && op.uid === entry.uid && (op.action === "add_transaction" || op.action === "replace_transaction")) pending = op;
      else rest.push(op);
    });
    if (pending && pending.action === "add_transaction") {
      rest.push({
        kind: "write",
        uid: entry.uid,
        action: "add_transaction",
        requestId: pending.requestId,
        data: entry.data,
        local: entry.local || pending.local || null,
        voidAfter: !!pending.voidAfter
      });
      return rest;
    }
    if (pending && pending.action === "replace_transaction") {
      rest.push({
        kind: "write",
        uid: entry.uid,
        action: "replace_transaction",
        requestId: pending.requestId,
        data: replaceBody(pending.data.txn_id, entry.data),
        local: entry.local || null
      });
      return rest;
    }
    if (entry.replace && entry.txnId) {
      rest.push({
        kind: "write",
        uid: entry.uid,
        action: "replace_transaction",
        requestId: entry.requestId,
        data: replaceBody(entry.txnId, entry.data),
        local: entry.local || null
      });
      return rest;
    }
    rest.push({
      kind: "write",
      uid: entry.uid,
      action: "add_transaction",
      requestId: entry.requestId,
      data: entry.data,
      local: entry.local || null
    });
    return rest;
  }

  function queueVoid(queue, entry) {
    var rest = [];
    var pendingAdd = null;
    (queue || []).forEach(function (op) {
      if (!op || op.uid !== entry.uid) {
        rest.push(op);
        return;
      }
      if (op.action === "add_transaction") pendingAdd = op;
    });
    if (pendingAdd && !entry.txnId) {
      pendingAdd.voidAfter = true;
      pendingAdd.local = { op: "deleteTx", uid: entry.uid };
      rest.push(pendingAdd);
      return rest;
    }
    if (!entry.txnId) return rest;
    rest.push({
      kind: "void",
      uid: entry.uid,
      action: "void_transaction",
      requestId: "cc-" + entry.uid + "-void",
      data: { txn_id: entry.txnId, void_reason: "CostCode 刪除" },
      local: { op: "deleteTx", uid: entry.uid }
    });
    return rest;
  }

  function queueTransfer(queue, entry) {
    var pending = null;
    var rest = [];
    (queue || []).forEach(function (op) {
      if (op && op.uid === entry.uid && op.action === "add_transfer") pending = op;
      else rest.push(op);
    });
    rest.push({
      kind: "pay",
      uid: entry.uid,
      action: "add_transfer",
      requestId: pending ? pending.requestId : entry.requestId,
      data: entry.data,
      local: null
    });
    return rest;
  }

  function queueLeg(queue, entry) {
    var rest = [];
    var pending = null;
    (queue || []).forEach(function (op) {
      var match = false;
      if (!op) match = false;
      else if (entry.leg === "adv" || entry.leg === "repay") match = op.uid === entry.uid && op.leg === entry.leg && op.action !== "void_transaction";
      else match = op.uid === entry.uid && (op.action === "add_transaction" || op.action === "replace_transaction");
      if (match) pending = op;
      else rest.push(op);
    });
    var local = Object.prototype.hasOwnProperty.call(entry, "local") ? entry.local : (pending && pending.local) || null;
    if (pending && (pending.action === "add_transaction" || pending.action === "add_transfer")) {
      rest.push({
        kind: pending.kind || (pending.action === "add_transfer" ? "pay" : "write"),
        uid: entry.uid,
        leg: entry.leg || pending.leg || "",
        action: pending.action,
        requestId: pending.requestId,
        data: entry.data,
        local: local,
        voidAfter: !!pending.voidAfter,
        voidRequestId: pending.voidRequestId || ""
      });
      return rest;
    }
    if (pending && pending.action === "replace_transaction") {
      rest.push({
        kind: "write",
        uid: entry.uid,
        leg: entry.leg || pending.leg || "",
        action: "replace_transaction",
        requestId: pending.requestId,
        data: replaceBody(pending.data.txn_id, entry.data),
        local: local
      });
      return rest;
    }
    if (entry.replace && entry.txnId && entry.action === "add_transaction") {
      rest.push({
        kind: "write",
        uid: entry.uid,
        leg: entry.leg || "exp",
        action: "replace_transaction",
        requestId: entry.requestId,
        data: replaceBody(entry.txnId, entry.data),
        local: local
      });
      return rest;
    }
    rest.push({
      kind: entry.action === "add_transfer" ? "pay" : "write",
      uid: entry.uid,
      leg: entry.leg || "",
      action: entry.action,
      requestId: entry.requestId,
      data: entry.data,
      local: local
    });
    return rest;
  }

  function queueTransferEdit(queue, entry) {
    var pendingAdd = null;
    (queue || []).forEach(function (op) {
      if (op && op.uid === entry.uid && op.leg === entry.leg && op.action === "add_transfer") pendingAdd = op;
    });
    if (pendingAdd) {
      return queueLeg(queue, {
        uid: entry.uid,
        leg: entry.leg,
        action: "add_transfer",
        requestId: pendingAdd.requestId,
        data: entry.data,
        local: Object.prototype.hasOwnProperty.call(entry, "local") ? entry.local : pendingAdd.local
      });
    }
    var next = (queue || []).slice();
    if (entry.txnId) {
      var hasVoid = next.some(function (op) {
        return op && op.action === "void_transaction" && op.uid === entry.uid && op.leg === entry.leg;
      });
      if (!hasVoid) {
        next.push({
          kind: "void",
          uid: entry.uid,
          leg: entry.leg,
          action: "void_transaction",
          requestId: entry.voidRequestId,
          data: { txn_id: entry.txnId, void_reason: "CostCode 修改" },
          local: null
        });
      }
    }
    return queueLeg(next, {
      uid: entry.uid,
      leg: entry.leg,
      action: "add_transfer",
      requestId: entry.requestId,
      data: entry.data,
      local: entry.local || null
    });
  }

  function queueVoidLeg(queue, entry) {
    var rest = [];
    var pending = null;
    (queue || []).forEach(function (op) {
      if (!op || op.uid !== entry.uid) {
        rest.push(op);
        return;
      }
      var isTarget = entry.leg === "adv"
        ? op.leg === "adv" && op.action !== "void_transaction"
        : (op.action === "add_transaction" || op.action === "replace_transaction");
      if (isTarget) pending = op;
      else rest.push(op);
    });
    var unsentAdd = pending && (pending.action === "add_transaction" || pending.action === "add_transfer");
    if (unsentAdd && !entry.txnId) {
      if (entry.dropUnsent) return rest;
      pending.voidAfter = true;
      pending.voidRequestId = entry.voidRequestId || pending.voidRequestId || "";
      if (entry.local) pending.local = entry.local;
      rest.push(pending);
      return rest;
    }
    if (!entry.txnId) return rest;
    var voidId = entry.voidRequestId;
    if (rest.some(function (op) { return op && op.requestId === voidId; })) return rest;
    rest.push({
      kind: "void",
      uid: entry.uid,
      leg: entry.leg || "",
      action: "void_transaction",
      requestId: voidId,
      data: { txn_id: entry.txnId, void_reason: entry.reason || "CostCode 刪除" },
      local: entry.local || null
    });
    return rest;
  }

  function revOf(requestId) {
    var match = /-r(\d+)$/.exec(String(requestId || ""));
    return match ? Number(match[1]) : 0;
  }

  function taipeiStamp(date) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date || new Date());
    function grab(type) {
      var part = parts.find(function (item) { return item.type === type; });
      return part ? part.value : "";
    }
    return grab("year") + "-" + grab("month") + "-" + grab("day") + "T" + grab("hour") + ":" + grab("minute") + ":" + grab("second") + "+08:00";
  }

  function selfCheck() {
    var cases = [];
    function check(name, ok, detail) {
      cases.push({ name: name, ok: !!ok, detail: detail || "" });
    }
    function plan(main, sub, extra) {
      return planTx(Object.assign({
        uid: "u1",
        date: "2026-10-20",
        type: "expense",
        amount: 120,
        accountId: "ACC-CASH-TWD",
        currency: "TWD",
        mainName: main,
        subName: sub,
        memo: "牛肉麵"
      }, extra || {}));
    }

    var food = plan("餐費", "午餐");
    check("餐費→餐飲", food.ok && food.data.txn_type === "expense" && food.data.category === "餐飲" && food.data.amount === -120 && food.data.flow_class === "external", JSON.stringify(food.data || food));
    check("request_id", food.requestId === "cc-u1");
    check("說明格式", food.ok && food.data.description === "[CostCode] 餐費›午餐 牛肉麵");
    check("儲值 Icash", plan("餐費", "Icash加值", { memo: "" }).data.category === "交通");
    check("儲值悠遊卡", plan("交通費", "悠遊卡加值", { memo: "" }).data.category === "交通");
    check("儲值一卡通", plan("交通費", "一卡通", { memo: "" }).data.category === "交通");
    check("交通本體", plan("交通費", "捷運", { memo: "" }).data.category === "交通");
    check("壓歲錢", plan("日常家庭", "壓歲錢", { memo: "" }).data.category === "人情禮物");
    check("保險", plan("健康醫療", "保險", { memo: "" }).data.category === "保險");
    check("日常家庭", plan("日常家庭", "日用品", { memo: "" }).data.category === "居家生活");
    var fee = plan("金融財經", "手續費", { amount: 15, memo: "提領" });
    check("手續費", fee.ok && fee.data.txn_type === "fee" && fee.data.category === "手續費" && fee.data.amount === -15);
    check("樂透", plan("金融財經", "樂透", { memo: "" }).data.category === "休閒娛樂");
    var transfer = plan("金融財經", "轉帳");
    check("轉帳擋下", !transfer.ok && transfer.error.indexOf("繳卡費") >= 0, transfer.error);
    check("金融其他擋下", !plan("金融財經", "其他").ok);
    check("薪資擋下", mainHidden("薪水獎金") && !plan("薪水獎金", "薪水", { type: "income" }).ok);
    check("投資擋下", mainHidden("投資") && !resolveCategory("投資", "股票", "income").ok);
    check("餐費仍顯示", !mainHidden("餐費") && !mainHidden("金融財經"));
    check("子類轉帳隱藏", subHidden("金融財經", "轉帳") && !subHidden("金融財經", "樂透"));
    var work = plan("工作", "應酬", { memo: "客戶", reimburse: true, amount: 800 });
    check("待報帳", work.ok && work.data.category === "工作" && work.data.description === "[CostCode] 工作›應酬 客戶 待報帳");
    var noFlag = plan("餐費", "午餐", { reimburse: true });
    check("非工作不加待報帳", noFlag.ok && noFlag.data.description.indexOf("待報帳") < 0);
    check("手機電腦", plan("手機電腦", "配件", { memo: "" }).data.category === "3C通訊");
    check("衣服", plan("衣服美妝", "上衣", { memo: "" }).data.category === "服飾美容");
    check("繳費", plan("繳費", "電費", { memo: "" }).data.category === "帳單繳費");
    var giftIn = planTx({ uid: "in1", date: "2026-10-20", type: "income", amount: 600, accountId: "ACC-CASH-TWD", mainName: "其他收入", subName: "生日禮金", memo: "紅包" });
    check("其他收入", giftIn.ok && giftIn.data.txn_type === "income" && giftIn.data.category === "其他收入" && giftIn.data.amount === 600);
    PF_MAP.forEach(function (rule) {
      if (rule.action === "expense" && PF_CATEGORIES.indexOf(rule.category) < 0) {
        check("17類含 " + rule.category, false, rule.mains + " → " + rule.category);
      }
    });
    check("支出規則都在17類", cases.filter(function (item) { return item.name.indexOf("17類含") === 0 && !item.ok; }).length === 0);

    var pay = planTransfer({
      uid: "pay1",
      date: "2026-10-20",
      amount: 3000,
      fromId: "ACC-FUBON-TWD",
      toId: "ACC-CC-FUBON-WORLD",
      fromType: "bank_cash",
      toType: "credit_card",
      memo: "10月"
    });
    check("繳卡費", pay.ok && pay.action === "add_transfer" && pay.requestId === "cc-pay1" && pay.data.flow_class === "internal" && pay.data.from.amount === -3000 && pay.data.to.amount === 3000 && pay.data.from.amount + pay.data.to.amount === 0);
    check("繳卡費拒絕現金錢包", !planTransfer({ uid: "pay2", date: "2026-10-20", amount: 10, fromId: "ACC-CASH-TWD", toId: "ACC-CC-X", fromType: "cash_wallet", toType: "credit_card" }).ok);

    var accounts = normalizeAccounts([
      { account_id: "ACC-CASH-TWD", name: "現金", type: "cash_wallet", currency: "TWD", status: "active" },
      { account_id: "ACC-CC-FUBON-WORLD", name: "富邦世界", type: "credit_card", currency: "TWD", status: "active" },
      { account_id: "ACC-FUBON-TWD", name: "富邦活存", type: "bank_cash", currency: "TWD", status: "active" },
      { account_id: "ACC-BROKER", name: "證券", type: "brokerage", currency: "TWD", status: "active" },
      { account_id: "ACC-OLD", name: "舊卡", type: "credit_card", currency: "TWD", status: "closed" }
    ]);
    var payList = payAccounts(accounts);
    check("帳戶篩選", payList.length === 3 && bankAccounts(accounts).length === 1 && cardAccounts(accounts).length === 1 && payList[0].id === "ACC-CASH-TWD");

    var queued = queueWrite([], { uid: "u1", requestId: "cc-u1", data: food.data, local: { op: "upsertTx" } });
    var edited = queueWrite(queued, { uid: "u1", requestId: "cc-u1-r1", data: Object.assign({}, food.data, { amount: -90 }), replace: true, txnId: "TX1" });
    check("離線改稿沿用 request_id", edited.length === 1 && edited[0].action === "add_transaction" && edited[0].requestId === "cc-u1" && edited[0].data.amount === -90);
    var afterSync = queueWrite([], { uid: "u1", requestId: "cc-u1-r1", data: food.data, replace: true, txnId: "TX1" });
    check("已入帳的修改走 replace", afterSync[0].action === "replace_transaction" && afterSync[0].requestId === "cc-u1-r1" && afterSync[0].data.txn_id === "TX1" && afterSync[0].data.data.category === "餐飲");
    var again = queueWrite(afterSync, { uid: "u1", requestId: "cc-u1-r2", data: Object.assign({}, food.data, { amount: -10 }), replace: true, txnId: "TX1" });
    check("未送出的 replace 不換 request_id", again[0].requestId === "cc-u1-r1" && again[0].data.data.amount === -10);
    var voidQueued = queueVoid(queued, { uid: "u1", txnId: "" });
    check("未入帳就刪除", voidQueued.length === 1 && voidQueued[0].voidAfter === true && voidQueued[0].action === "add_transaction" && voidQueued[0].requestId === "cc-u1");
    var voidKnown = queueVoid(queued, { uid: "u1", txnId: "TX9" });
    check("已入帳刪除", voidKnown.length === 1 && voidKnown[0].action === "void_transaction" && voidKnown[0].requestId === "cc-u1-void" && voidKnown[0].data.txn_id === "TX9");
    check("重試判斷", shouldRetryPost({ ok: false, reason: "lost_body" }, 0) && !shouldRetryPost({ ok: false, error: "V9: request_id reused with different payload" }, 0) && !shouldRetryPost({ ok: true }, 0));
    var postUrl = withPostQuery("https://example.com/macros/s/demo/exec", "sample-key");
    check("POST 查詢字串", postUrl.indexOf("m=post") >= 0 && postUrl.indexOf("token=") >= 0);
    check("網址檢查", endpointError("", "12345678") && !endpointError("https://example.com/exec", "12345678"));
    var stamp = taipeiStamp(new Date("2026-10-20T01:02:03Z"));
    check("台北 ISO", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(stamp) && stamp.indexOf("+08:00") === stamp.length - 6, stamp);
    check("txn id", txnIdFromResponse({ ok: true, replay: true, result_ref: "TX-1,TX-2" }) === "TX-1" && txnIdFromResponse({ ok: true, result: { ids: ["TX-9"] } }) === "TX-9");
    check("版本修訂號", revOf("cc-u1-r3") === 3 && revOf("cc-u1") === 0);

    var splitInput = {
      uid: "u",
      date: "2026-10-20",
      type: "expense",
      amount: 100,
      advance: 40,
      accountId: "ACC-CC-1",
      accountType: "credit_card",
      currency: "TWD",
      mainName: "餐費",
      subName: "午餐",
      memo: "牛肉麵",
      friendName: "小明"
    };
    var split = planSplit(splitInput);
    var expLeg = split.ok && split.legs.filter(function (leg) { return leg.leg === "exp"; })[0];
    var advLeg = split.ok && split.legs.filter(function (leg) { return leg.leg === "adv"; })[0];
    check("代墊拆帳", split.ok && split.mine === 60 && split.advance === 40 && split.mine + split.advance === split.total && expLeg && advLeg && expLeg.requestId === "cc-u-exp" && expLeg.data.amount === -60 && expLeg.data.account_id === "ACC-CC-1" && advLeg.requestId === "cc-u-adv" && advLeg.action === "add_transfer" && advLeg.data.from.account_id === "ACC-CC-1" && advLeg.data.from.amount === -40 && advLeg.data.to.account_id === AR_FRIENDS && advLeg.data.to.amount === 40 && advLeg.data.from.amount + advLeg.data.to.amount === 0 && advLeg.data.flow_class === "internal" && advLeg.data.description.indexOf("小明") >= 0 && advLeg.data.description.indexOf("午餐") >= 0 && advLeg.data.description.indexOf("牛肉麵") >= 0, JSON.stringify(split));
    check("代墊超過總額", !planSplit(Object.assign({}, splitInput, { advance: 150 })).ok);
    check("代墊沒有名字", !planSplit(Object.assign({}, splitInput, { friendName: "  " })).ok);
    var whole = planSplit(Object.assign({}, splitInput, { advance: 100 }));
    check("整筆代墊", whole.ok && whole.wholeAdvance && whole.legs.length === 1 && whole.legs[0].leg === "adv" && whole.legs[0].requestId === "cc-u-adv" && whole.localAmount === 0 && whole.legs[0].data.from.amount === -100);
    var standalone = planSplit(Object.assign({}, splitInput, { mode: "advance", amount: 80, advance: 0, mainName: "", subName: "", memo: "電影票" }));
    check("代墊類型", standalone.ok && standalone.wholeAdvance && standalone.legs.length === 1 && standalone.legs[0].requestId === "cc-u-adv" && standalone.legs[0].data.description.indexOf("小明") >= 0 && standalone.legs[0].data.description.indexOf("電影票") >= 0 && standalone.mine + standalone.advance === 80);
    var plainSplit = planSplit(Object.assign({}, splitInput, { uid: "u1", advance: 0, friendName: "" }));
    check("沒有代墊沿用原 request_id", plainSplit.ok && plainSplit.legs.length === 1 && plainSplit.legs[0].requestId === "cc-u1" && plainSplit.legs[0].data.amount === -100);
    var odd = planSplit(Object.assign({}, splitInput, { amount: 10.1, advance: 0.2 }));
    check("代墊金額加總", odd.ok && odd.mine === 9.9 && odd.advance === 0.2 && odd.mine + odd.advance === 10.1 && odd.legs[0].data.amount === -9.9 && odd.legs[1].data.from.amount === -0.2);
    var repay = planRepay({ uid: "r1", date: "2026-10-20", amount: 40, toId: "ACC-FUBON-TWD", toType: "bank_cash", friendName: "小明" });
    check("朋友還錢", repay.ok && repay.action === "add_transfer" && repay.requestId === "cc-r1-repay" && repay.data.from.account_id === AR_FRIENDS && repay.data.from.amount === -40 && repay.data.to.account_id === "ACC-FUBON-TWD" && repay.data.to.amount === 40 && repay.data.from.amount + repay.data.to.amount === 0 && repay.data.description.indexOf("小明") >= 0, repay.error || "");
    check("朋友還錢不進信用卡", !planRepay({ uid: "r2", date: "2026-10-20", amount: 10, toId: "ACC-CC-1", toType: "credit_card", friendName: "小明" }).ok);
    check("朋友還錢要有名字", !planRepay({ uid: "r3", date: "2026-10-20", amount: 10, toId: "ACC-CASH-TWD", toType: "cash_wallet", friendName: "" }).ok);

    function asQueueLeg(leg) {
      return { uid: "u", leg: leg.leg, action: leg.action, requestId: leg.requestId, data: leg.data, local: leg.leg === "exp" ? { op: "upsertTx" } : null };
    }
    var queuedSplit = [];
    split.legs.forEach(function (leg) { queuedSplit = queueLeg(queuedSplit, asQueueLeg(leg)); });
    var editedSplit = planSplit(Object.assign({}, splitInput, { advance: 25 }));
    editedSplit.legs.forEach(function (leg) { queuedSplit = queueLeg(queuedSplit, asQueueLeg(leg)); });
    var queuedExp = queuedSplit.filter(function (op) { return op.action === "add_transaction"; })[0];
    var queuedAdv = queuedSplit.filter(function (op) { return op.leg === "adv" && op.action === "add_transfer"; })[0];
    check("代墊離線改金額", queuedSplit.length === 2 && queuedExp && queuedAdv && queuedExp.requestId === "cc-u-exp" && queuedExp.data.amount === -75 && queuedAdv.requestId === "cc-u-adv" && queuedAdv.data.from.amount === -25 && queuedAdv.data.to.amount === 25, JSON.stringify(queuedSplit.map(function (op) { return op.requestId + ":" + op.action; })));
    var keptPlain = queueLeg([], { uid: "u", leg: "exp", action: "add_transaction", requestId: "cc-u", data: food.data, local: { op: "upsertTx" } });
    split.legs.forEach(function (leg) { keptPlain = queueLeg(keptPlain, asQueueLeg(leg)); });
    var keptExp = keptPlain.filter(function (op) { return op.action === "add_transaction" || op.action === "replace_transaction"; });
    check("未送出的支出改代墊不另開 request_id", keptExp.length === 1 && keptExp[0].requestId === "cc-u" && keptExp[0].data.amount === -60 && keptPlain.some(function (op) { return op.requestId === "cc-u-adv"; }));
    var revised = queueTransferEdit([], {
      uid: "u",
      leg: "adv",
      txnId: "TXA",
      voidRequestId: "cc-u-adv-void",
      requestId: "cc-u-adv-r1",
      data: advLeg.data
    });
    var revisedAgain = queueTransferEdit(revised, {
      uid: "u",
      leg: "adv",
      txnId: "TXA",
      voidRequestId: "cc-u-adv-void",
      requestId: "cc-u-adv-r2",
      data: Object.assign({}, advLeg.data, { description: advLeg.data.description + " 改" })
    });
    var revisedAdd = revisedAgain.filter(function (op) { return op.action === "add_transfer"; })[0];
    var revisedVoid = revisedAgain.filter(function (op) { return op.action === "void_transaction"; })[0];
    check("已入帳代墊先作廢再重送", revisedAgain.length === 2 && revisedVoid && revisedVoid.requestId === "cc-u-adv-void" && revisedVoid.data.txn_id === "TXA" && revisedAdd && revisedAdd.requestId === "cc-u-adv-r1" && revisedAdd.data.description.indexOf("改") >= 0);
    var dropped = queueVoidLeg(queuedSplit, { uid: "u", leg: "adv", txnId: "", voidRequestId: "cc-u-adv-void", dropUnsent: true });
    check("拿掉未送出的代墊", dropped.length === 1 && dropped[0].requestId === "cc-u-exp" && !dropped.some(function (op) { return op.leg === "adv"; }));
    var voidKnownAdv = queueVoidLeg([], { uid: "u", leg: "adv", txnId: "TXA", voidRequestId: "cc-u-adv-void" });
    check("已入帳代墊刪除", voidKnownAdv.length === 1 && voidKnownAdv[0].action === "void_transaction" && voidKnownAdv[0].requestId === "cc-u-adv-void" && voidKnownAdv[0].data.txn_id === "TXA");
    check("應收帳戶", AR_FRIENDS === "ACC-AR-FRIENDS" && AR_FRIENDS_NAME === "朋友代墊（應收）" && hasFriendsAccount([{ account_id: AR_FRIENDS, name: AR_FRIENDS_NAME, type: "asset", currency: "TWD", status: "active" }]) && !payAccounts([{ account_id: AR_FRIENDS, name: AR_FRIENDS_NAME, type: "asset", currency: "TWD", status: "active" }]).length);
    check("busy 不立刻重試", !shouldRetryPost({ ok: false, error: "busy" }, 0) && !shouldRetryPost({ ok: false, error: "busy" }, 1));
    check("伺服器錯誤仍重試", shouldRetryPost({ ok: false, error: "server" }, 0) && shouldRetryPost({ ok: false, error: "server" }, 1) && !shouldRetryPost({ ok: false, error: "server" }, 2));
    check("重試間隔", retryDelayMs(0) === 0 && retryDelayMs(1) === 400 && retryDelayMs(2) === 800 && retryDelayMs(3) === 1600 && retryDelayMs(8) === 8000);
    var ttl = 12 * 60 * 60 * 1000;
    check("帳戶快取 12 小時", ACCOUNT_TTL_MS === ttl && accountCacheFresh(1000, 1000 + ttl - 1) && !accountCacheFresh(1000, 1000 + ttl) && !accountCacheFresh("", 1000) && !accountCacheFresh(5000, 4000));
    check("讀取逾時", PF_GET_TIMEOUT_MS === 15000);
    check("request_id 維持原樣", food.requestId === "cc-u1" && split.legs[0].requestId === "cc-u-exp" && split.legs[1].requestId === "cc-u-adv" && repay.requestId === "cc-r1-repay");

    return { ok: cases.every(function (item) { return item.ok; }), cases: cases };
  }

  return {
    PF_CATEGORIES: PF_CATEGORIES,
    PF_MAP: PF_MAP,
    BLOCK_NOTE: BLOCK_NOTE,
    AR_FRIENDS: AR_FRIENDS,
    AR_FRIENDS_NAME: AR_FRIENDS_NAME,
    resolveCategory: resolveCategory,
    mainHidden: mainHidden,
    subHidden: subHidden,
    planTx: planTx,
    planTransfer: planTransfer,
    planAdvance: planAdvance,
    planRepay: planRepay,
    planSplit: planSplit,
    buildDescription: buildDescription,
    normalizeAccounts: normalizeAccounts,
    isPayAccount: isPayAccount,
    payAccounts: payAccounts,
    bankAccounts: bankAccounts,
    cardAccounts: cardAccounts,
    repayAccounts: repayAccounts,
    hasFriendsAccount: hasFriendsAccount,
    endpointError: endpointError,
    withPostQuery: withPostQuery,
    shouldRetryPost: shouldRetryPost,
    retryDelayMs: retryDelayMs,
    accountCacheFresh: accountCacheFresh,
    PF_GET_TIMEOUT_MS: PF_GET_TIMEOUT_MS,
    ACCOUNT_TTL_MS: ACCOUNT_TTL_MS,
    explainError: explainError,
    txnIdFromResponse: txnIdFromResponse,
    queueWrite: queueWrite,
    queueVoid: queueVoid,
    queueTransfer: queueTransfer,
    queueLeg: queueLeg,
    queueTransferEdit: queueTransferEdit,
    queueVoidLeg: queueVoidLeg,
    revOf: revOf,
    taipeiStamp: taipeiStamp,
    selfCheck: selfCheck
  };
});
