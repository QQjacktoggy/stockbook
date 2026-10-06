# Stockbook B 版（jackstock-ed2d2-b）

`public/` 的基準版本是 2026-10-06 從線上 B 站（部署版本 2e26374cfdaadbe3）取回的檔案，
比 `stockbook-firebase-b.zip` 新，多了 `native-auth.js`（Email／密碼登入）。
`__/firebase/*` 由 Firebase Hosting 自動提供，不收進來。

- 測試：`cd b && node --test tests/shared-ledger.test.js`
- 部署（只部署 B Hosting）：`npx firebase-tools deploy --only hosting --config firebase.b.json --project jackstock-ed2d2`
  在 `b/` 目錄執行。zip 內的 `deploy-stockbook-firebase-b.ps1` 會比對舊檔 SHA-256，改版後不能再用。
