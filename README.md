# 🐙 OsakaPocket — 大阪旅遊隨身夾

兩人去大阪用的 PWA。離線可用，加到 iPhone 主畫面就像原生 App。

旅程：**2026/8/11 – 8/17（七日六夜）**

---

## ✅ 13 個分頁、全部離線可用

| 分頁 | 內容 |
|---|---|
| 🏠 **首頁** | 倒數天數、actionable cards（旅前該辦 / 役男狀態 / 卡夾完成度 / 上次備份）、8 月警示 |
| 📅 **行程** | 7 天可完全自訂：改主題、加減條目、拖拉重排、從景點清單挑、一鍵重設 |
| 📍 **景點** | 44 個景點（大阪市區 / 京都 / 奈良 / 神戶 / **限時祭典**）+ 我的自訂景點 + Leaflet 地圖（cluster 顯示）+ Apple Maps 一鍵開啟 |
| 🪪 **卡夾** | 機票 / 護照 / **役男核准** / 飯店 / 保險 / 信用卡 / 緊急聯絡 — 全部 IndexedDB 本機儲存、可上傳 PDF / 照片附件 |
| ⋯ **更多** | 進入下面 8 個分頁的入口 |
| ✅ 旅前 To-Do | 65 項待辦（含 **8/16 京都五山送り火** 規劃）— 進度條、urgent 自動標紅 |
| 🆘 緊急資訊 | 駐大阪辦事處 / 110 / 119 / 醫院 — tap-to-call、地址跳 Maps |
| 🗣 日語短語 | 90 句 6 類 + iOS TTS 語音、可收藏、可搜尋 |
| 🚆 交通票券 | 關空 → 市區 5 種比較、大阪周遊卡、京阪奈、地鐵漢字對照 |
| 🍜 美食推薦 | 21 道大阪名物 + 推薦店家 |
| 🛍 必買清單 | 30 項可勾選 / 5 類藥妝零食 |
| 💰 兩人記帳 | 日圓 + 台幣即時換算、3 種分擔模式（均分 / 我自己 / 她自己） |
| 💾 備份 / 設定 | **匯出 / 匯入 JSON 備份**（iOS 7 天會清資料，必用！） |

## 🎯 為 iPhone 優化

- 所有 input 16px 不會被 iOS 自動 zoom
- 所有觸控目標 ≥ 44pt（Apple HIG 標準）
- 護照末四碼、座標等用對應 inputmode 跳適合鍵盤
- Modal 開啟時 body scroll 鎖、點背景 / ESC 關閉
- URL hash 路由 → iOS 滑回手勢可用
- 子頁有「← 更多」返回 chip
- Focus trap、自動 focus 第一個欄位
- 自訂 toast / confirm sheet 取代 native alert
- TTS warm-up 解決 iOS PWA 第一次靜音 bug
- Leaflet 地圖：100dvh、44pt pin、markercluster 自動合併重疊 pin
- Sortable 行程編輯：拖到邊緣自動滾動

## 📦 大小

約 **560 KB**（含 Leaflet + Sortable + Markercluster + 所有資料 + 圖示）

---

## 🚀 部署到 GitHub Pages

### 一、本地測試（先看一切正常）

```powershell
cd C:\Users\User\japan
py -m http.server 8765
```

打開 `http://localhost:8765` → 看到 OsakaPocket 首頁就 OK。

> ⚠️ 一定要用 http(s) 開，**不能直接點 index.html**（file:// 會讓 fetch + Service Worker 失效）。

### 二、推到 GitHub + 開 Pages

PWA 必須 HTTPS 才能在 iPhone 上完整安裝。GitHub Pages 免費附 HTTPS。

1. **建 GitHub 帳號**（如果沒有）：<https://github.com/signup>
2. **建新 repo**：
   - 名字例如 `osakapocket`
   - 設為 **Public**（Pages 需要）
3. **本地推上去**：
   ```powershell
   cd C:\Users\User\japan
   git init
   git add .
   git commit -m "init OsakaPocket"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/osakapocket.git
   git push -u origin main
   ```
4. **開啟 Pages**：
   - repo 頁面 → **Settings** → **Pages**
   - Source 選 `Deploy from a branch`、Branch 選 `main`、Folder 選 `/ (root)` → Save
   - 等 1-2 分鐘 → 拿到網址：`https://<你的帳號>.github.io/osakapocket/`

### 三、iPhone 安裝

1. iPhone Safari 打開上述網址
2. 點下方分享圖示 ⤴
3. 往下捲找 **加入主畫面**（Add to Home Screen）
4. 命名 `OsakaPocket`，按右上 **加入**
5. 桌面出現章魚圖示 → 點開就是全螢幕 App

> 💡 兩人都要裝：網址用 LINE 傳給女友，她照樣加到主畫面。

### 四、🔥 第一次裝完必做

1. **進「💾 備份 / 設定」頁** → 試一次「匯出備份」確認流程
2. **進「🪪 卡夾」** → 填機票、護照末四碼、保險
3. **進「✅ 旅前 To-Do」** → 看「該辦了」紅色項目，**今天就申請役男核准**
4. 出發前一週：「💾 備份」匯出完整 JSON 寄給自己 / iCloud Drive 存好

---

## ⚠️ iOS 7 天清資料規則

iOS Safari 對 PWA 套用儲存清理：**連續 7 天不開 App，所有本機資料會被清空**（卡夾、行程備註、勾選、記帳、附件、自訂景點全消失）。

對策：
1. 旅途中 **至少每 5-6 天打開一次** App
2. 出發前一週 **必匯出備份** 到 iCloud
3. 萬一被清掉，去「備份」頁匯入備份恢復

---

## 🔄 之後改東西怎麼更新

```powershell
cd C:\Users\User\japan
git add .
git commit -m "你的更新訊息"
git push
```

GitHub Pages 30 秒到 2 分鐘自動重新部署。iPhone 上下次打開 App 會出現「📦 有新版」橫幅 → 點一下就更新（不會打斷你正在輸入的內容）。

---

## 📁 專案結構

```
japan/
├── index.html              ← 主頁面（13 個分頁 SPA）
├── manifest.json           ← PWA 設定
├── service-worker.js       ← 離線快取（v15）
├── styles.css              ← 樣式
├── app.js                  ← 主程式（~2500 行）
├── data/
│   ├── itinerary.json      ← 7 天行程
│   ├── spots.json          ← 44 景點
│   ├── prep.json           ← 65 項旅前待辦
│   ├── emergency.json      ← 緊急聯絡資料
│   ├── phrases.json        ← 90 句日語短語
│   ├── transport.json      ← 交通票券比較
│   ├── foods.json          ← 21 道美食
│   └── shopping.json       ← 30 項必買
├── icons/
│   ├── icon-192.png        ← Android / 桌面圖示
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png ← iPhone 主畫面圖示
│   └── favicon-32.png
├── vendor/                 ← 第三方 lib（離線可用）
│   ├── leaflet.js / .css
│   ├── leaflet.markercluster.js / 2 個 CSS
│   └── Sortable.min.js
└── scripts/
    └── make_icons.py       ← 重新生圖示用（dev only）
```

## 🛠 想改內容

- **改行程預設值**：`data/itinerary.json`（用戶可在 App 內覆寫）
- **加景點**：`data/spots.json` 或 App 內「我的景點」
- **改顏色 / UI**：`styles.css` 開頭的 `:root` 變數
- **重畫 icon**：改 `scripts/make_icons.py` 顏色，再 `py scripts/make_icons.py`
- **加旅前項目**：`data/prep.json`
- **加美食 / 必買**：對應 JSON

---

🐙 一路順風、平安回家。
