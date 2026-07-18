# Stockbook Rollout Plan — 2026-07-18

## 目標

在不覆蓋 Firebase 生產帳本資料的前提下，將 Stockbook 的交易流程修正與同步/部署流程安全地推進到可審查、可驗證、可回復的 rollout。所有程式變更先經 GitHub Pull Request 審查，再進行 Firebase 部署。

## 來源與邊界

- 生產資料來源：Firebase Firestore 帳本。
- 生產程式來源：Firebase Hosting 目前部署的 `public/` 檔案。
- GitHub repository：`QQjacktoggy/stockbook`。
- 本文件涵蓋 rollout 的前置檢查、交易流程驗證、PR 與部署順序；不授權直接修改或刪除 Firestore 生產資料。

## Rollout 順序

### P0 — 發布前安全檢查

1. 確認 Git 根目錄是 Stockbook 專案，`origin` 指向 `QQjacktoggy/stockbook`；不可把 Desktop 或 `C:/` 當成 repo root。
2. 使用正式帳號登入 Stockbook，從 Settings > Firebase Sync 執行「從 Firebase 載入」。
3. 載入後立即下載本機 JSON 備份，保存為 `data/firebase-ledger-snapshot-YYYY-MM-DD.json`；若快照不存在，停止部署，不猜測或直接覆蓋 Firestore。
4. 只在專案 checkout 內進行修改，明確排除系統檔案、憑證、臨時檔與其他不相關工作區變更。

### P1 — 交易流程候選版本

1. 借券/放空賣出支援多個來源庫存 lot；保留 `sourceInventoryLotId` 相容格式，並以逗號分隔多個來源 id。
2. 借券來源 picker 支援多選、按選取順序扣除，並驗證選取來源的可借股數合計足夠。
3. 將尚未回補的借券任務計入來源 lot 的可借股數，避免同一批庫存重複借出。
4. 借券回補與來源成本報表支援多來源 lot。
5. 用測試帳本驗證：建立 400 股與 100 股兩個 lot，借券賣出 500 股；再驗證回補後任務狀態可由 `OPEN` 進入 `PARTIAL`/`CLOSED`，且報表能顯示多來源成本。

### P1/P2 — 使用體驗整理

依審查結果分批實作，避免把未驗證的 UI 變更與資料同步/部署混在一起：

- 交易頁固定顯示現金餘額、持股股數/張數與總市值。
- 快速買賣 modal 顯示交易前現金、可用庫存、交易後剩餘庫存與預估淨收付。
- 借券來源 picker 顯示已選筆數、可借合計與借出後剩餘可借數。
- 回補任務頁清楚區分一般回補與借券回補。
- 交易流水提供借券賣出、借券回補、一般賣出的清楚標籤與篩選。
- Firebase Sync 狀態固定顯示 `Local only`、`Pending`、`Synced`、`Failed`；失敗時保留最後錯誤與下載備份提示。

## 驗證門檻

在開 PR 前至少完成：

- `node --check public/app.js`
- 專案既有測試（若依賴已安裝）
- 上述 400 + 100 股多來源借券賣出/回補測試
- 檢查 PR diff 只包含本 rollout 的文件與程式變更

## GitHub 與部署順序

1. 在專用分支提交 rollout 文件與已驗證的程式變更。
2. Push 分支並開 Draft PR，PR 內容說明變更、原因、驗證方式與尚未完成的 Firebase 快照/部署步驟。
3. PR 審查與人工確認 diff 後，才執行 `npm run firebase:deploy`。
4. 部署後重新取得 `https://jackstock-ed2d2.web.app/app.js` 的 ETag，與本地/部署快取的 `app.js` hash 比對。
5. 部署若失敗，先保留本機快照與 PR 證據，再依既有 Firebase rollback 流程處理；不可用未驗證的本地資料覆蓋生產帳本。

## 目前狀態

- rollout plan 已整理到本文件。
- Firebase 生產帳本快照與正式部署仍需在有登入狀態的 Stockbook 環境中由使用者確認。
- 本文件預期先以 Draft PR 交付，待驗證與審查後再進入部署階段。
