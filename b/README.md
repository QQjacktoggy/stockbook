# Stockbook B 版（jackstock-ed2d2-b）

`public/` 的基準版本是 2026-10-06 從線上 B 站（部署版本 2e26374cfdaadbe3）取回的檔案，
比 `stockbook-firebase-b.zip` 新，多了 `native-auth.js`（Email／密碼登入）。
`__/firebase/*` 由 Firebase Hosting 自動提供，不收進來。

- 測試：`cd b && node --test tests/shared-ledger.test.js`
- 部署（只部署 B Hosting）：`npx firebase-tools deploy --only hosting --config firebase.b.json --project jackstock-ed2d2`
  在 `b/` 目錄執行。zip 內的 `deploy-stockbook-firebase-b.ps1` 會比對舊檔 SHA-256，改版後不能再用。

## B 版可做的事（2026-10-06 第一批補齊）

- 一般買進、賣出；入金、出金、股息、利息（入出金會記錄當天 0050 基準價，和 A 相同）。
- 更新報價：和 A 一樣依序試 Yahoo、TWSE、FinMind，存回帳本的 `marketQuotes`。
- 已配對或已對帳的交易可以改金額與股數，存檔時重新計算配對；若會讓其他賣出配不到庫存則拒絕。
- 待買回清單可以直接記錄買回（配對到該筆賣出）或手動結案（寫入 `manualClosedRebuySellIds`）。

## 第 2 階段（股票與庫存操作）

- 新增股票：和 A 的 `handleSecurityCreate` 相同欄位，代號不可重複。
- 借券賣出：可從多批庫存借出（A 的 `validateBorrowSellSourceLots`）；借券回補連到借券任務（`rebuyCycleId`），不可超過待回補股數。借券交易可修改，規則同 A。
- 借券任務：庫存頁「待買回」分頁顯示待回補與已結清的借券。
- 配對：賣出明細列出配對到的買進與已實現損益，可重新選擇買進與配對股數（A 的「儲存配對」，`manualMatchedShares`）。
- 庫存成本交換：新增、預覽、撤銷（A 的 `calculateInventoryCostExchangePlan`）；刪除買進時一併撤銷相關成本交換，和 A 相同。

## 第 3 階段（帳戶、轉帳與設定）

- 現金轉帳：新增、修改、刪除（`accountTransfers`，費用由轉出帳戶負擔）。轉出帳戶現金不足時拒絕。
- 股票轉戶：新增、修改、刪除（`positionTransfers`）。和 A 一樣只做紀錄，不會移動庫存批次。
- 投資帳本新增與改名；券商帳戶新增、修改、設為預設、停用。沒有任何紀錄的帳戶才能刪除。
- 券商費率（手續費率、折扣、最低手續費、股票與 ETF 交易稅率）與帳本設定（預設股票、買回價差、核心持股、對帳容忍、費稅分攤）。
- 股票清單可修改代號、名稱、市場、Yahoo 代號與類型；沒被使用的股票可以刪除。
- 第一次使用：雲端沒有帳本時可直接在 B 建立（結構同 A 的首次登入）。已存在的帳本一律不覆蓋。
