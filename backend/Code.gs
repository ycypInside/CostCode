// 日用帳 ExpenseApp 後端
// 從 Google 試算表：擴充功能 → Apps Script，整份貼上。請保留這些 // 註解。
// 指令碼屬性設定 TOKEN。不要把 TOKEN 寫進這個檔案。
// 修改後：部署 → 管理部署作業 → 編輯 → 新版本。不要按「新增部署作業」，否則網址會換。
// 版本格式為台北時間 YYYYMMDD-HHMM。成功回應都會帶 version。doGet 只回版本、不含資料。
// clear 已停用。deleteTx 只把 Transactions 的 deleted 標成 1，不刪列。讀取時略過 deleted。

const BACKEND_VERSION = "20261020-1715";

const SHEETS = {
  Transactions: {
    headers: ["uid", "date", "type", "amount", "accountId", "class1", "class2", "projectId", "memo", "invoiceId", "photoFileId", "createdAt", "modifiedAt", "deleted"],
    nums: ["amount"],
  },
  Accounts: {
    headers: ["id", "name", "currency", "initialBalance", "weeklyBudget", "monthlyBudget", "type", "color"],
    nums: ["initialBalance", "weeklyBudget", "monthlyBudget"],
  },
  Projects: {
    headers: ["id", "name", "memo", "color", "priority"],
    nums: ["priority"],
  },
  Categories: {
    headers: ["id", "level", "parentId", "kind", "name", "icon", "sortOrder"],
    nums: ["sortOrder"],
  },
  ReceiptItems: {
    headers: ["invoiceId", "sellerId", "date", "total", "itemName", "price", "count"],
    nums: ["total", "price", "count"],
  },
  Settings: {
    headers: ["key", "value"],
    nums: [],
  },
};

function doGet() {
  return json_({ ok: true, app: "ExpenseApp", version: BACKEND_VERSION });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: "伺服器忙碌，請稍後再試", version: BACKEND_VERSION });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: "沒有內容", version: BACKEND_VERSION });
    }
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return json_({ ok: false, error: "JSON 無法解析", version: BACKEND_VERSION });
    }
    const tokenError = tokenError_(body.token);
    if (tokenError) return json_({ ok: false, error: tokenError, version: BACKEND_VERSION });

    const action = String(body.action || "");
    let result;
    if (action === "ping") {
      result = { time: Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss") };
    } else if (action === "all") {
      result = readAll_();
    } else if (action === "clear") {
      return json_({ ok: false, error: "clear 已停用，不會清空試算表", version: BACKEND_VERSION });
    } else if (action === "append") {
      result = appendRows_(body.sheet, body.rows);
    } else if (action === "upsertTx") {
      result = upsertTx_(body.row);
    } else if (action === "deleteTx") {
      result = deleteTx_(body.uid);
    } else if (action === "setSetting") {
      result = setSetting_(body.key, body.value);
    } else if (action === "uploadPhoto") {
      result = uploadPhoto_(body.name, body.base64, body.mime);
    } else if (action === "getPhoto") {
      result = getPhoto_(body.fileId);
    } else {
      return json_({ ok: false, error: "未知的動作", version: BACKEND_VERSION });
    }
    result.ok = true;
    result.version = BACKEND_VERSION;
    result.app = "ExpenseApp";
    return json_(result);
  } catch (err) {
    return json_({
      ok: false,
      error: String(err && err.message ? err.message : err),
      version: BACKEND_VERSION,
    });
  } finally {
    lock.releaseLock();
  }
}

function tokenError_(got) {
  const exp = PropertiesService.getScriptProperties().getProperty("TOKEN") || "";
  if (!exp) return "後端還沒設定 TOKEN。請到 Apps Script 的指令碼屬性新增 TOKEN。";
  const given = got == null ? "" : String(got);
  if (!given || given.length !== exp.length) return "TOKEN 不正確";
  let mismatch = 0;
  for (let i = 0; i < exp.length; i++) mismatch |= exp.charCodeAt(i) ^ given.charCodeAt(i);
  if (mismatch) return "TOKEN 不正確";
  return "";
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("請從 Google 試算表的「擴充功能 → Apps Script」建立這個指令碼。獨立指令碼沒有綁定的試算表。");
  }
  try {
    if (ss.getSpreadsheetTimeZone() !== "Asia/Taipei") ss.setSpreadsheetTimeZone("Asia/Taipei");
  } catch (err) {}
  return ss;
}

function sheet_(name, forWrite) {
  const spec = SHEETS[name];
  if (!spec) throw new Error("未知的分頁：" + name);
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  let created = false;
  if (!sh) {
    sh = ss.insertSheet(name);
    created = true;
  }
  const width = spec.headers.length;
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, width).setValues([spec.headers]);
    created = true;
  } else {
    const current = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v); });
    if (current.join("|") !== spec.headers.join("|")) {
      sh.getRange(1, 1, 1, width).setValues([spec.headers]);
    }
  }
  sh.setFrozenRows(1);
  if (created || forWrite) applyFormats_(sh, spec);
  return sh;
}

function applyFormats_(sh, spec) {
  const rows = Math.max(sh.getMaxRows(), 2);
  spec.headers.forEach(function (header, index) {
    const range = sh.getRange(1, index + 1, rows, 1);
    if (spec.nums.indexOf(header) >= 0) range.setNumberFormat("0.##");
    else range.setNumberFormat("@");
  });
}

function formatNewRows_(sh, spec, startRow, numRows) {
  spec.headers.forEach(function (header, index) {
    const range = sh.getRange(startRow, index + 1, numRows, 1);
    if (spec.nums.indexOf(header) >= 0) range.setNumberFormat("0.##");
    else range.setNumberFormat("@");
  });
}

function readAll_() {
  const settings = {};
  readSheet_("Settings").forEach(function (row) {
    settings[row.key] = row.value;
  });
  return {
    transactions: readSheet_("Transactions"),
    accounts: readSheet_("Accounts"),
    projects: readSheet_("Projects"),
    categories: readSheet_("Categories"),
    receiptItems: readSheet_("ReceiptItems"),
    settings: settings,
  };
}

function readSheet_(name) {
  const spec = SHEETS[name];
  const sh = sheet_(name, false);
  const values = sh.getDataRange().getValues();
  const idHeader = name === "ReceiptItems" ? "invoiceId" : (name === "Settings" ? "key" : spec.headers[0]);
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    spec.headers.forEach(function (header, c) {
      obj[header] = coerceIn_(header, values[r][c], spec);
    });
    if (obj[idHeader] === "" || obj[idHeader] == null) continue;
    if (name === "Transactions" && isDeletedFlag_(obj.deleted)) continue;
    out.push(obj);
  }
  return out;
}

function coerceIn_(header, value, spec) {
  if (value instanceof Date) {
    const pattern = header === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm:ss";
    return Utilities.formatDate(value, "Asia/Taipei", pattern);
  }
  if (spec.nums.indexOf(header) >= 0) {
    if (value === "" || value == null) return 0;
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }
  if (value == null) return "";
  return String(value);
}

function isDeletedFlag_(value) {
  return value === 1 || value === true || value === "1" || String(value).toLowerCase() === "true";
}

function clearSheet_() {
  throw new Error("clear 已停用，不會清空試算表");
}

function appendRows_(name, rows) {
  const spec = SHEETS[name];
  if (!spec) throw new Error("未知的分頁：" + name);
  if (!rows || !rows.length) return { added: 0, skipped: 0 };
  if (!Array.isArray(rows)) throw new Error("rows 必須是陣列");
  if (rows.length > 800) throw new Error("單次最多 800 列");
  const sh = sheet_(name, true);
  const seen = existingKeys_(sh, name);
  const prepared = [];
  let skipped = 0;
  rows.forEach(function (row) {
    if (!Array.isArray(row)) throw new Error("每一列都必須是陣列");
    const arr = row.slice();
    while (arr.length < spec.headers.length) arr.push("");
    const coerced = spec.headers.map(function (header, i) {
      return coerceOut_(header, arr[i], spec);
    });
    const key = rowKey_(name, coerced);
    if (key && seen[key]) {
      skipped++;
      return;
    }
    if (key) seen[key] = true;
    prepared.push(coerced);
  });
  if (!prepared.length) return { added: 0, skipped: skipped };
  const start = sh.getLastRow() + 1;
  formatNewRows_(sh, spec, start, prepared.length);
  sh.getRange(start, 1, prepared.length, spec.headers.length).setValues(prepared);
  return { added: prepared.length, skipped: skipped };
}

function coerceOut_(header, value, spec) {
  if (spec.nums.indexOf(header) >= 0) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
  }
  if (value == null) return "";
  return String(value);
}

function rowKey_(name, arr) {
  if (name === "ReceiptItems") {
    if (!arr[0]) return "";
    return [arr[0], arr[4], arr[5], arr[6]].map(function (v) { return String(v); }).join("|");
  }
  if (arr[0] === "" || arr[0] == null) return "";
  return String(arr[0]);
}

function existingKeys_(sh, name) {
  const seen = {};
  const last = sh.getLastRow();
  if (last < 2) return seen;
  if (name === "ReceiptItems") {
    const vals = sh.getRange(2, 1, last - 1, SHEETS.ReceiptItems.headers.length).getValues();
    vals.forEach(function (row) {
      const key = rowKey_(name, row);
      if (key) seen[key] = true;
    });
    return seen;
  }
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  vals.forEach(function (row) {
    if (row[0] !== "" && row[0] != null) seen[String(row[0])] = true;
  });
  return seen;
}

function upsertTx_(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("row 必須是物件");
  const uid = row.uid == null ? "" : String(row.uid);
  if (!uid) throw new Error("缺少 uid");
  const spec = SHEETS.Transactions;
  const sh = sheet_("Transactions", true);
  const values = spec.headers.map(function (header) {
    return coerceOut_(header, row[header], spec);
  });
  const hits = findRows_(sh, uid);
  if (hits.length) {
    formatNewRows_(sh, spec, hits[0], 1);
    sh.getRange(hits[0], 1, 1, spec.headers.length).setValues([values]);
    return { uid: uid, updated: true };
  }
  const start = sh.getLastRow() + 1;
  formatNewRows_(sh, spec, start, 1);
  sh.getRange(start, 1, 1, spec.headers.length).setValues([values]);
  return { uid: uid, updated: false };
}

function deleteTx_(uid) {
  const id = uid == null ? "" : String(uid);
  if (!id) throw new Error("缺少 uid");
  const spec = SHEETS.Transactions;
  const sh = sheet_("Transactions", true);
  const hits = findRows_(sh, id);
  const deletedCol = spec.headers.indexOf("deleted") + 1;
  const modifiedCol = spec.headers.indexOf("modifiedAt") + 1;
  const stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd'T'HH:mm:ss") + "+08:00";
  hits.forEach(function (rowIndex) {
    if (deletedCol > 0) sh.getRange(rowIndex, deletedCol).setNumberFormat("@").setValue("1");
    if (modifiedCol > 0) sh.getRange(rowIndex, modifiedCol).setNumberFormat("@").setValue(stamp);
  });
  return { uid: id, deleted: hits.length, soft: true };
}

function findRows_(sh, uid) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  const hits = [];
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(uid)) hits.push(i + 2);
  }
  return hits;
}

function setSetting_(key, value) {
  const name = key == null ? "" : String(key).trim();
  if (!name) throw new Error("缺少 key");
  const sh = sheet_("Settings", true);
  const stored = value == null ? "" : String(value);
  const hits = findRows_(sh, name);
  if (hits.length) {
    formatNewRows_(sh, SHEETS.Settings, hits[0], 1);
    sh.getRange(hits[0], 1, 1, 2).setValues([[name, stored]]);
  } else {
    const start = sh.getLastRow() + 1;
    formatNewRows_(sh, SHEETS.Settings, start, 1);
    sh.getRange(start, 1, 1, 2).setValues([[name, stored]]);
  }
  return { key: name, value: stored };
}

function uploadPhoto_(name, base64, mime) {
  const payload = String(base64 || "").replace(/^data:[^,]*,/, "");
  if (!payload) throw new Error("沒有照片內容");
  if (payload.length > 6 * 1024 * 1024) throw new Error("照片太大（上限約 4MB）");
  const type = allowedMime_(mime);
  const folder = photoFolder_();
  const bytes = Utilities.base64Decode(payload);
  const blob = Utilities.newBlob(bytes, type, safeName_(name));
  const file = folder.createFile(blob);
  return { fileId: file.getId(), name: file.getName() };
}

function getPhoto_(fileId) {
  const id = String(fileId || "");
  if (!id || id.indexOf("local:") === 0 || id.indexOf("pending:") === 0) throw new Error("找不到照片");
  const folder = photoFolder_();
  const file = DriveApp.getFileById(id);
  if (file.isTrashed() || !fileInFolder_(file, folder)) throw new Error("找不到照片");
  const blob = file.getBlob();
  return {
    fileId: id,
    mime: blob.getContentType() || "image/jpeg",
    base64: Utilities.base64Encode(blob.getBytes()),
  };
}

function allowedMime_(mime) {
  const value = String(mime || "image/jpeg").toLowerCase();
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp" || value === "image/gif") return value;
  return "image/jpeg";
}

function safeName_(name) {
  const base = String(name || "photo.jpg").split(/[/\\]/).pop().replace(/[\r\n\t]/g, "");
  return base.slice(0, 80) || "photo.jpg";
}

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("PHOTO_FOLDER_ID");
  if (saved) {
    try {
      const existing = DriveApp.getFolderById(saved);
      if (!existing.isTrashed()) return existing;
    } catch (err) {}
  }
  const found = DriveApp.getFoldersByName("ExpenseApp Photos");
  while (found.hasNext()) {
    const folder = found.next();
    if (!folder.isTrashed()) {
      props.setProperty("PHOTO_FOLDER_ID", folder.getId());
      return folder;
    }
  }
  const created = DriveApp.createFolder("ExpenseApp Photos");
  props.setProperty("PHOTO_FOLDER_ID", created.getId());
  return created;
}

function fileInFolder_(file, folder) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) return true;
  }
  return false;
}
