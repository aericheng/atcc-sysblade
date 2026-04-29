# apps/web — Sysblade HyperBuffer demo

ATCC C13 demo 的 Next.js 14 客戶端。三個 SaaS 板塊 + 一個首頁,**靜態匯出**到 Vercel CDN。

## 路由

| 路徑 | Server Component | Client Component | 資料來源 |
|---|---|---|---|
| `/` | `src/app/page.tsx` | — | `model_validation.json` 動態取延遲值 |
| `/twin` | `src/app/twin/page.tsx` | `twin-client.tsx` | `transient_*.json` + `aging_lfp.json` + `model_validation.json` |
| `/tco` | `src/app/tco/page.tsx` | `tco-client.tsx` | `src/lib/tco.ts` 寫死的 §G.3 公式 |
| `/dashboard` | `src/app/dashboard/page.tsx` | `dashboard-client.tsx` + `us-fleet-map.tsx` | `fleet_devices.json` |

## 關鍵架構

**Server Component 在 build time 用 `fs.readFile` 讀 JSON,Client Component 拿 props 渲染。**
這條路在 `next.config.mjs` 的 `output: "export"` 模式下才成立 — 加 `"use client"` 到任何
讀檔的 page.tsx 會 silent 產出壞頁面。

```
public/scenarios/*.json
   │
   │ fs.readFile (build time only)
   ▼
src/app/[route]/page.tsx (Server Component)
   │
   │ props
   ▼
src/app/[route]/[route]-client.tsx (Client Component)
   │
   │ recharts / react-simple-maps render
   ▼
out/ (next build) → Vercel CDN
```

## 開發

```bash
pnpm install                     # 第一次
pnpm dev                         # → http://localhost:3000
pnpm typecheck                   # tsc --noEmit
pnpm lint                        # next lint
pnpm build                       # next build → out/
```

要更新場景數值請從 repo 根目錄跑 `pnpm scenarios`(觸發 `scripts/generate_twin_scenarios.py`),
**不要手改 `public/scenarios/*.json`** — 那些都是 generator 雙寫的。

## 部署

`main` push 自動觸發 Vercel build。CLI 部署 `vercel --prod`。詳細見 repo 根 `DEPLOY.md`。

**Vercel 用 `npm install --legacy-peer-deps` 不用 pnpm**(pnpm 9 + Node 22 fetch bug;見 `vercel.json`)。
本地 dev 仍用 pnpm,lockfile 在 repo root。

## 板塊有的小坑

- **`/tco` 的 cost-breakdown chart 不用 recharts** — 用純 HTML/Tailwind bar。
  recharts 3.x 的內部 store 在 slider 拖動時會死循環(React #185),改寫成 plain HTML 是唯一穩定解
- **`/twin` 兩張波形圖有 sweep 動畫** — 24 fps loop,hover 暫停。`useSweep` hook 在 `twin-client.tsx`
- **`/dashboard` 表格在手機要 horizontal scroll** — Tier-3 queue 7 column,小螢幕一定爆,用 `min-w-[680px] + whitespace-nowrap` 強制橫向滾
