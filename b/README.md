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

## 第 4 階段（匯入與對帳）

- 匯入券商 CSV（國泰格式，和 A 的 `importBrokerCsv` 相同，重複列以 checksum 略過，只新增券商成交、不新增交易）與 JSON 交易帳本。UTF-8 讀不到表頭時改用 Big5 解碼。
- 匯入紀錄：可刪除批次，範圍同 A（CSV 刪券商成交；JSON 連同建立的交易），並清掉相關的「採用券商金額」紀錄。被其他交易引用時拒絕。
- 匯入模板：新增、刪除（預設國泰模板不可刪）。和 A 一樣，匯入目前依國泰欄位判讀。
- 對帳：全部採用券商金額；帳本缺少紀錄可依券商成交補記；其他差異可直接開啟帳本那筆交易修改。重新對帳＝重新載入後重算。

## 第 5 階段（報表、備份與資料安全）

- 報表頁（更多 → 報表與匯出）：總覽、0050 基準、損益、庫存風險、現金流、交易品質，數字直接來自 A 的 `buildPdfReportModel` 等報表函式，可依帳戶篩選。
- 入出金缺 0050 基準價時顯示「補齊基準價」（A 的 `backfillMissingBenchmarkPrices`）。A 會在匯出前自動補；B 改成按鈕，因為會寫入共用帳本。
- 匯出 PDF（A 的 `buildPrettyPdfReportHtml`，開新視窗列印；被擋時改下載 HTML）、匯出 Excel（同 A 的 .xls）、Email 摘要（mailto，內容同 A）。
- JSON 備份：下載與還原都用 A 的 `stockbook-backup-v2` 格式與 SHA-256 驗證，A、B 互通。還原前先下載目前資料的安全備份，再以 A 的 `mergeCurrentUserState` 取代帳本內容；驗證失敗的檔案拒絕。
- Google Drive 備份：呼叫現有的 Cloud Functions（`getBackupStatus`、`startDriveAuthorization`、`runBackupNow`、`disconnectDrive`，asia-east1），函式本身不改。

## 審查後的保護（PR #29 review）

- 修改買進後，借券賣出仍要借得到足夠庫存（A 的 `validateBorrowSellSourceLots` 重新驗證），否則拒絕。
- 做過成本交換的買進，要先撤銷成本交換，才能改日期、帳戶、股數或價格（A 允許，但交換金額會套錯）。
- 任何修改都不能讓券商帳戶現金變成負數；原本就是負數的帳戶不能再變更少。匯入與還原除外。
- 第一次建帳本改用 Firestore REST commit 加上 `exists:false` 前置條件：只能新建，兩台裝置同時建立也不會互相覆蓋。
- 還原前要先下載安全備份並勾選確認；畫面說明還原會取代這個帳號的全部資料，不只是目前的帳本。

## 對帳：從 Google Drive 匯入最新 CSV

- 對帳 → 匯入 → Google Drive：預設資料夾是 jack 的券商 CSV 資料夾（`DEFAULT_FOLDER_ID`），可以改貼其他 Drive 資料夾連結，並為每個券商帳戶設定檔名關鍵字（預設是帳戶名稱，例如 jack、penny；不分大小寫）。設定存在帳本的 `settings.driveImport[portfolioId]`，手機和電腦共用，A 版會原樣保留。
- 「找最新的 CSV」：列出資料夾內的 CSV（也支援 Google 試算表，會匯出成 CSV），每個帳戶取檔名含自己關鍵字、最新修改的一個；同時含兩個帳戶關鍵字的檔案會略過。可以單筆或全部匯入，重複的成交列照常以 checksum 略過。
- 授權：用 Firebase 的 Google 重新登入取得唯讀 Drive 權限（`drive.readonly`），存取權杖只放在記憶體、約 50 分鐘後重新要求。B 只讀取，不會修改 Drive；不需要雲端函式。
- 需要 Firebase 專案（Google Cloud）已啟用 Google Drive API；沒啟用時畫面會直接說明。

## 對帳：重複匯入的券商紀錄

- 同一筆券商成交（同帳戶、日期、買賣、股票、委託書號、成交序號、股數、價格、淨額）被匯入兩次時，對帳會變成「股數不一致」，差異剛好是一半。B 會標成「券商紀錄重複」，並提供「移除重複的券商紀錄」：每組只保留最早匯入的那份，帳本交易與庫存不動，只重新對帳（`removeDuplicateExecutions`，會寫稽核紀錄）。沒有委託書號的成交不會被視為重複。
- 對帳卡片的「帳本金額」由券商淨額減差異算出（A 的對帳表也是這樣算）；帳本缺少的紀錄顯示「—」。
- 「異常」分頁與 A 對帳頁的「只看異常」清單相同（未相符且未採用券商金額）。A 上方的「待確認差異」卡片只算可採用的費稅／金額差，所以兩邊的數字會不同。
