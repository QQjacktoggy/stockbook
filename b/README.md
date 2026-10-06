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
- 已配對或已對帳的交易可以改金額與股數，存檔時重新計算配對；若會讓其他賣出配不到庫存則拒絕。借券交易只能改價格與費用。
- 待買回清單可以直接記錄買回（配對到該筆賣出）或手動結案（寫入 `manualClosedRebuySellIds`）。
