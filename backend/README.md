# CostCode 後端快照（Apps Script）

這是 live Apps Script 的唯讀快照（2026-10-20 以 clasp clone 取得），作為版本控管備份。

- scriptId：`1p5PVxPIpWICD-T_38dPKquDQMJ-3LcbdLYHbp5Lhq_amWpYnGy42iRRJ`（綁定「我的記賬」試算表）
- 線上原始檔名為 `程式碼.gs`，此處存為 `Code.gs`
- BACKEND_VERSION：`20261020-1715`
- appsscript.json：V8、Asia/Taipei、webapp executeAs USER_DEPLOYING、access ANYONE_ANONYMOUS

## 2026-10-20 加固（只改這份 repo，不要從這裡自動部署）

- `clear` 會直接回錯誤，不會刪任何列。`clearSheet_` 也只會丟出錯誤。
- `deleteTx` 改為軟刪：Transactions 最後一欄是 `deleted`。刪除時寫入 `1`，並把 `modifiedAt` 更新成台北時間 ISO（結尾 `+08:00`）。`all` 不再回傳已標刪除的列。
- 舊的試算表沒有 `deleted` 欄時，下次有人呼叫後端會把表頭補上，資料列不會被清掉。

## 部署
1. 試算表 → 擴充功能 → Apps Script，貼上 `Code.gs`。
2. 專案設定 → 指令碼屬性：`TOKEN`（自訂長密碼，不要寫進程式或 repo）。`PHOTO_FOLDER_ID` 會自動建立。
3. 部署 → 管理部署作業 → 編輯 → 新版本（不要新增部署，否則網址會換）。新版本應回報 `20261020-1715`。前端若顯示後端過舊，就是還沒做這一步。
4. 前端「設定」貼上部署網址與 TOKEN。網址與 TOKEN 不放進 repo。
