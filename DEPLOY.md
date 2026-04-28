# Deploy to Vercel — 5 minute guide

The demo is a static Next.js app at `apps/web/`. Two ways to deploy.

## Option A — Vercel CLI (fastest if you can run a browser auth flow)

Open a terminal at the repo root, then:

```bash
cd apps/web

# 1. Authenticate (opens a browser tab the first time)
vercel login

# 2. Deploy a preview build
vercel

# 3. Promote to production
vercel --prod
```

The first `vercel` invocation will ask:

```
? Set up and deploy "apps/web"? [Y/n]              y
? Which scope?                                      <your username>
? Link to existing project?                         n
? What's your project's name?                       sysblade-atcc
? In which directory is your code located?          ./
? Want to override the settings?                    n
```

Answer as shown. Vercel auto-detects Next.js and uses the `vercel.json` already
in `apps/web/`.

After ~60 seconds you'll see two URLs:

```
✓ Production: https://sysblade-atcc.vercel.app  [+1m]
```

Paste that URL into your slide deck.

## Option B — GitHub auto-deploy (no terminal needed)

1. Go to <https://vercel.com/new>
2. **Import Git Repository** → pick `aericheng/atcc-sysblade`
3. Configure:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (auto-detected)
   - Leave everything else default
4. Click **Deploy**.

Subsequent pushes to `main` auto-deploy. Branch deploys get unique preview URLs.

## Verifying after deploy

The four pages must all load:

- `/` (landing)
- `/twin` (Battery Digital Twin — toggle LFP-only ↔ Hybrid)
- `/tco` (TCO Calculator with sliders)
- `/dashboard` (1000-device fleet, every panel watermarked SIMULATED DATA)

If you see "Application error" on any page, check the build log — most likely a
PyBaMM scenario JSON is missing under `apps/web/public/scenarios/`. Re-run:

```bash
.venv/Scripts/python.exe scripts/generate_twin_scenarios.py
cp packages/shared/scenarios/*.json apps/web/public/scenarios/
git add -A && git commit -m "fix: regenerate scenarios" && git push
```

## Custom domain (optional)

If you want `sysblade.com/...` on the slide instead of `*.vercel.app`:

1. Buy `sysblade.com` (Namecheap / Cloudflare ~$12/yr)
2. In Vercel project → **Settings** → **Domains** → Add `sysblade.com`
3. Add the DNS records Vercel gives you at your registrar

For tomorrow's pitch: **`*.vercel.app` is fine — judges care about the demo, not
the domain string.**
