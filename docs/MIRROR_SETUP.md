---
title: "Mirror setup SOP — defensive contingency for GitHub account issues"
version: "v0.1"
date: "2026-05-27"
status: "Standby (not executed yet) — only trigger when GitHub account issue confirmed unrecoverable"
trigger: "GitHub account `aericheng` suspended OR repo permanently inaccessible to anonymous reviewers"
upstream: "docs/BBU_IMPLEMENTATION_PLAN.md v2.0"
---

# Mirror setup SOP — defensive contingency

## 觸發條件(只在以下情境執行,否則 standby)

執行此 SOP 的**必要條件**(任一達標即可):

1. <https://github.com/aericheng/atcc-sysblade> 對 anonymous reviewer 回 403/404 持續 > 24 hr
2. `git ls-remote https://github.com/aericheng/atcc-sysblade HEAD`(無 credential)失敗 持續 > 24 hr
3. GitHub Trust & Safety email 明文告知 permanent suspension + appeal 失敗
4. 距 2026-06-11 複賽日 < 7 天,且 GitHub-side recovery 無進展

**目前狀態**(2026-05-27 22:00 UTC+8):
- [v] Anonymous clone works(`/tmp/atcc-clone-test` 測過)
- [v] Vercel `sysblade-atcc.vercel.app` live
- [v] `git push` works(用戶 PAT/SSH path)
- [x] Actions runner GITHUB_TOKEN rejected("Your account is suspended")
- 用戶 GitHub login + inbox 診斷待回報

→ **目前不需要執行 mirror**。此 SOP 為 standby contingency,本機已加好空 remote(`git remote -v` 可見 `gitlab` / `codeberg`)。

---

## 候選 host 對比

| Host | URL | 帳號建立 | Repo 上限 | 對 ATCC 評審的可信度 | LFS 支援 | CI 替代 | 評分 |
|---|---|---|---|---|---|---|---|
| **GitLab.com** | <https://gitlab.com> | email 即可 | 公開無上限 | (廣為人知) | [v] 10 GB free | GitLab CI yaml(可直接抄 .github/workflows/ 轉換)| **首選** |
| **Codeberg.org** | <https://codeberg.org> | email,需手動審核 ~24hr | 公開無上限 | (較小眾,但用 Gitea 開源好) | [v] 1 GB free | Codeberg CI(Woodpecker)| **次選** |
| **SourceHut** | <https://sr.ht> | 付費 \$2/月起 | — | (極小眾,但工程師圈口碑佳) | [x] | builds.sr.ht | 不推 |

**建議走 GitLab.com**:評審 ATCC 業師應該都知道 GitLab,clone instructions 不用解釋。Codeberg 是 GitLab 出問題的二線備援。

---

## 執行步驟(觸發後 30 分鐘可上線)

### Step 1 · 建 GitLab 帳號 + 空 repo(~5 min)

```
1. 開 https://gitlab.com/users/sign_up
   - 帳號名建議:aericheng(若可用)或 aericheng-mirror
   - email 用跟 GitHub 同一個(便於對齊身份)
2. 登入後 → New project → Create blank project
   - Project name: atcc-sysblade
   - Visibility: Public(評審要能 clone)
   - Initialize with README: [x] unchecked(我們已有本地 main)
3. 拿到 repo URL,例如 https://gitlab.com/aericheng/atcc-sysblade
```

### Step 2 · Push 全部歷史(~5-10 min,~80 MB)

本機 `gitlab` remote 已預先 config 為 placeholder URL,需更新真實 URL 後 push:

```bash
# 本機 cwd = repo root
git remote set-url gitlab https://gitlab.com/aericheng/atcc-sysblade.git
# 第一次 push,完整歷史(main 全部 commits + tags)
git push -u gitlab main
# Verify
git remote -v
git ls-remote gitlab HEAD
```

如果 push 過程要密碼:GitLab → Settings → Access Tokens → 建 PAT scope `write_repository`,當作密碼貼。

### Step 3 · 更新所有 docs 的 GitHub URL → GitLab URL(~10 min)

下列 **7 個檔**含 `aericheng/atcc-sysblade` reference(grep 跑過),全部要改:

| 檔 | 用 sed 或 Edit tool 改 |
|---|---|
| `docs/BBU_PROPOSAL.md` | `github.com/aericheng` → `gitlab.com/aericheng` |
| `docs/INVESTOR_BRIEF.md` | 同上 |
| `docs/whitepaper.md` | 同上 |
| `docs/RD_BRIEF.md` | 同上 |
| `DEPLOY.md` | 同上 |
| `scripts/update_proposal_docx.py` | 字串檢查 |
| `scripts/generate_proposal_v22.py` | 字串檢查 |

**一鍵 sed**(Windows PowerShell):

```powershell
$files = @(
  "docs\BBU_PROPOSAL.md",
  "docs\INVESTOR_BRIEF.md",
  "docs\whitepaper.md",
  "docs\RD_BRIEF.md",
  "DEPLOY.md",
  "scripts\update_proposal_docx.py",
  "scripts\generate_proposal_v22.py"
)
foreach ($f in $files) {
  $content = Get-Content $f -Raw -Encoding UTF8
  $content = $content -replace 'github\.com/aericheng/atcc-sysblade', 'gitlab.com/aericheng/atcc-sysblade'
  $content = $content -replace 'aericheng/atcc-sysblade', 'aericheng/atcc-sysblade (GitLab mirror)'
  Set-Content -Path $f -Value $content -Encoding UTF8
}
```

**bash 版**:

```bash
files=(
  docs/BBU_PROPOSAL.md
  docs/INVESTOR_BRIEF.md
  docs/whitepaper.md
  docs/RD_BRIEF.md
  DEPLOY.md
  scripts/update_proposal_docx.py
  scripts/generate_proposal_v22.py
)
for f in "${files[@]}"; do
  sed -i 's|github\.com/aericheng/atcc-sysblade|gitlab.com/aericheng/atcc-sysblade|g' "$f"
done
```

跑完後 `make verify-fast` 確認 cross-check 仍 40/40 PASS(URL 是字串不會影響數字驗證)。

### Step 4 · GitLab CI 對齊 .github/workflows/(可選,~20 min)

GitLab CI 用 `.gitlab-ci.yml`(repo root),語法跟 GitHub Actions 不同但概念相似。**最小可運作版**:

```yaml
# .gitlab-ci.yml — mirror of .github/workflows/{check,verify}.yml
image: python:3.11

stages: [check, verify]

xcheck:
  stage: check
  script:
    - python scripts/check_whitepaper_numbers.py

twin-validation:
  stage: verify
  before_script:
    - pip install "numpy>=1.26,<2.0" pandas pyarrow scipy h5py loguru matplotlib pybamm scikit-learn
  script:
    - python scripts/eval_lic_rc_fit.py
    - python scripts/generate_full_rack_60s_sim.py
    - python scripts/generate_n_minus_1_sim.py
    - python scripts/check_whitepaper_numbers.py
  artifacts:
    paths:
      - data/processed/lic_rc_fit_error.json
      - data/processed/rack_60s_graceful.png
      - data/processed/rack_n_minus_1.png
      - apps/web/public/scenarios/rack_60s_graceful.json
      - apps/web/public/scenarios/rack_n_minus_1.json

web-build:
  stage: check
  image: node:20
  script:
    - cd apps/web
    - npm install --legacy-peer-deps
    - npx tsc --noEmit
    - npx next lint
    - npx next build
```

### Step 5 · Vercel 切 GitLab source(可選,~5 min)

若 Vercel 因 GitHub OAuth 被卡 → 切 GitLab:

```
Vercel dashboard → Settings → Git → Disconnect → Connect with GitLab → Pick atcc-sysblade
```

Vercel 對 GitLab 是 first-class 支援。

### Step 6 · 公告 mirror(可選,寫進 README + RD_BRIEF top)

新 banner 加到 docs 頂:

```markdown
> (!) **GitHub mirror notice (2026-05-2X)**: Due to GitHub account-level access
> restrictions on `aericheng`, this repository's canonical home is now
> https://gitlab.com/aericheng/atcc-sysblade. The original GitHub URL may
> still resolve to the same content but is no longer the authoritative source.
```

---

## 預估時程

| 任務 | 時間 | 累積 |
|---|---|---|
| Step 1 帳號 + 空 repo | 5 min | 5 min |
| Step 2 push 歷史 | 10 min | 15 min |
| Step 3 docs URL 改 | 10 min | 25 min |
| Step 4 CI yaml(可選)| 20 min | 45 min |
| Step 5 Vercel 切(若需)| 5 min | 50 min |
| Step 6 公告 banner | 5 min | 55 min |

**30 分鐘**達 functional mirror;**55 分鐘**達 full parity(含 CI + Vercel)。

---

## 本機 remote 預先 config(已執行,2026-05-27)

```bash
# 本機已加好 placeholder remote,只待 Step 1 完成換成真實 URL
git remote add gitlab https://gitlab.com/PLACEHOLDER/atcc-sysblade.git 2>/dev/null || true
git remote add codeberg https://codeberg.org/PLACEHOLDER/atcc-sysblade.git 2>/dev/null || true

# Verify
git remote -v
```

要 push 時:

```bash
git remote set-url gitlab https://gitlab.com/REAL-USERNAME/atcc-sysblade.git
git push -u gitlab main
```

---

## 對 ATCC 複賽日的影響

| 情境 | 對 demo path 影響 |
|---|---|
| GitHub OK(現況)| Demo 走原路,mirror standby 不執行 |
| GitHub `aericheng` 完全 suspended,Vercel 仍 work | Mirror Step 1-3 必執行(30 min);Step 4-5 看時間 |
| GitHub + Vercel 都掛 | Mirror Step 1-5 全執行(50 min);demo path 改 `gitlab.com/aericheng/atcc-sysblade` + 本機 `npx next dev` (port 3000) screen-share |
| 帳號活,只 Actions 掛(目前)| [x] 不執行 mirror;CI badge 紅但不影響 demo |

---

## 為什麼**現在**不執行

1. **過度反應**:Actions 紅燈不影響 demo,沒必要動架構
2. **URL churn**:docs 改了又改 risk 高,team 對 URL 的記憶會混亂
3. **Vercel risk**:Vercel OAuth chain 動了反而引入新風險,目前 work 不要動
4. **Trust & Safety appeal**:若是 false positive,24-72 hr GitHub 自己會解
5. **手上有 working baseline**:Vercel demo + local make verify + anonymous clone 三件都 work,demo path 不缺

只有當「觸發條件」明確達標(見頂部)才執行此 SOP。
