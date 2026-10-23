# PATTY.STUDIO 設定說明

這個資料夾就是完整的 app。資料存在你自己的 Firebase（Google 的雲端資料庫），app 放在 GitHub Pages。全部免費，大約 20 分鐘可以設定完。

設定完成後：
- 手機和電腦都能用，資料自動同步。
- 加到手機主畫面後，圖示是黃色小花中間一個手寫風的「P」，跟 IG 頭貼同一個風格。
- 沒有網路也能打開、查看和記錄，恢復網路後會自動上傳。
- 只有你的帳號看得到資料。

---

## 步驟 1：建立 Firebase 專案

1. 打開 https://console.firebase.google.com ，用你的 Google 帳號登入。
2. 按「建立專案」，名稱可以取 `patty-studio`。
3. Google Analytics 用不到，可以關掉，然後建立專案。

## 步驟 2：開啟 Email 登入，建立你的帳號

1. 左側選單：**建構 → Authentication**，按「開始使用」。
2. 「登入方式」分頁 → 選「電子郵件/密碼」→ 啟用第一個開關 → 儲存。
3. 「使用者」分頁 → 「新增使用者」→ 填你的 Email 和一組密碼。

之後在 app 裡就用這組 Email 和密碼登入。

## 步驟 3：建立資料庫並設定安全規則

1. 左側選單：**建構 → Firestore Database**，按「建立資料庫」。
2. 位置選 **asia-east1（台灣）**。
3. 模式選「正式版模式」，按建立。
4. 建好後切到「規則」分頁，把裡面的內容全部刪掉，貼上這個資料夾裡 `firestore.rules` 的內容，按「發布」。

這組規則的意思是：只有登入的你，才能讀寫你自己的資料。

## 步驟 4：把專案設定貼進 config.js

1. 回到 Firebase 專案首頁，按齒輪 → **專案設定**。
2. 往下找到「你的應用程式」，按網頁圖示 `</>` 新增一個網頁應用程式，名稱填 `PATTY.STUDIO`（不用勾 Firebase Hosting）。
3. 畫面會出現一段 `const firebaseConfig = { apiKey: "...", ... }`。
4. 用文字編輯器打開這個資料夾的 `config.js`，把 apiKey、authDomain、projectId、storageBucket、messagingSenderId、appId 逐項換成你的值，存檔。

這些值不是密碼，放在網路上是正常的；資料的安全由步驟 3 的規則保護。

## 步驟 5：上傳到 GitHub Pages

1. 打開 https://github.com ，登入後按右上角「＋」→「New repository」。
2. Repository name 填 `patty-studio`，選 **Public**，按「Create repository」。
3. 在新的 repository 頁面按「uploading an existing file」，把這個資料夾**裡面的所有檔案和資料夾**（index.html、config.js、fonts、icons 等）一起拖進去，按「Commit changes」。
4. 到 repository 的 **Settings → Pages**：
   - Source 選「Deploy from a branch」
   - Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
5. 等 1～3 分鐘，網址會是：`https://你的GitHub帳號.github.io/patty-studio/`

## 步驟 6：讓 Firebase 認得這個網址

1. 回到 Firebase：**Authentication → 設定 → 授權網域**。
2. 按「新增網域」，填 `你的GitHub帳號.github.io`（不用加 https 和後面的路徑）。

## 步驟 7：在手機上安裝

1. 用手機打開步驟 5 的網址，用步驟 2 的 Email 和密碼登入。
2. 第一次登入會問你要不要匯入之前在 Claude 帳本裡的資料，按「匯入」。
3. 加到主畫面：
   - **iPhone**：用 Safari 打開 → 下方「分享」→「加入主畫面」。
   - **Android**：用 Chrome 打開 → 右上角「⋮」→「安裝應用程式」或「加到主畫面」。

---

## 之後要更新 app

在 GitHub 的 repository 頁面，用「Add file → Upload files」上傳新的檔案（同名會直接覆蓋），按 Commit。手機上的 app 下次打開時就會更新。

**`config.js` 不要被覆蓋成空白的版本**：之後收到新版時，只要上傳 `index.html` 和其他有改的檔案就好。

## 備份

app 的「月收入」頁最下面有「匯出備份」，會下載一份 JSON 檔，裡面是所有資料。偶爾存一份在電腦或雲端硬碟就好。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| index.html | app 本體 |
| config.js | 你的 Firebase 專案設定（步驟 4） |
| firestore.rules | 資料庫安全規則（步驟 3 貼到 Firebase，不影響網站） |
| manifest.webmanifest | 讓手機把它當成 app 安裝 |
| sw.js | 離線也能打開的快取 |
| initial-data.json | 從 Claude 帳本搬過來的資料，第一次登入時匯入 |
| fonts/ | 源泉圓體（常用字） |
| icons/ | app 圖示（黃色小花＋手寫 P） |
