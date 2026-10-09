# 記帳 Web App（Google Sheet 版）

架構：`index.html`（前端，放 GitHub Pages）⇄ `Code.gs`（Google Apps Script，API）⇄ 你的 Google Sheet / Drive

## 設定步驟（約 10 分鐘）
1. 建一個新的 Google Sheet → 選單「擴充功能 → Apps Script」
2. 把 `Code.gs` 全部貼進去取代預設內容，存檔
3. 左側「專案設定 → 指令碼屬性」新增 `TOKEN`，值自訂一組長密碼
4. 右上「部署 → 新增部署作業」→ 類型「網頁應用程式」
   - 執行身分：**我**；誰可以存取：**所有人**（靠 TOKEN 保護）
   - 第一次部署會要求授權（含 Drive，用來存照片），照指示允許
5. 複製「網頁應用程式網址」（結尾 /exec）
6. 把 `index.html`、`icon.png`、`icon-192.png`、`icon-512.png`、`manifest.json` 一起放到 GitHub Pages（repo 設定 → Pages）
7. 手機/電腦開啟頁面 → 「設定」貼上網址與 TOKEN → 「匯入」選 `.cddb` → 上傳
8. iPhone Safari：分享 → 加入主畫面，即可像 App 一樣開啟

## 注意
- 修改 `Code.gs` 後要「管理部署作業 → 編輯 → 新版本」才會生效
- Sheet 會自動建立 Transactions / Accounts / Projects / Categories / ReceiptItems 五個分頁，可直接用 Sheets 做樞紐分析
- TOKEN 只存在你自己的瀏覽器 localStorage，不要寫進 index.html 或公開 repo

## 版本號與對照
- 前端 `index.html` 的 `APP_VERSION` 與後端 `Code.gs` 的 `BACKEND_VERSION`，格式都是檔案產生時間 `YYYYMMDD-HHMM`（台北時間）。
- 前端「設定」頁的「版本資訊」會顯示兩邊版本；若後端比前端需要的 `REQUIRES_BACKEND` 舊，會出現 ⚠️ 提醒你重新部署 Apps Script。
- 頁面最底部也會顯示 `前端 v… · 後端 v…`。
- 想單獨確認後端部署的版本：用瀏覽器直接開啟 `/exec` 網址，會看到 `{"ok":true,"app":"expense-backend","version":"..."}`（不含任何資料）。
- 兩個檔案「一起產生」時版本號相同；若只改前端，前端版本會比後端新，只要沒低於 `REQUIRES_BACKEND` 就視為相容。

## 離線佇列
連不上網時新增、修改、刪除會先存在手機，狀態列顯示「待同步 N 筆」，恢復連線（或下次開啟）後自動補傳。
