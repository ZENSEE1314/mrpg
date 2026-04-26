# Deploying Aetheria to Railway

Single-service deploy. Express serves Socket.IO + REST API + the built client SPA on one port.

## Option A — Railway dashboard (easiest, recommended)

1. Go to https://railway.com/new
2. **"Deploy from GitHub repo"** → pick `ZENSEE1314/mrpg`.
3. Railway auto-detects the `Dockerfile` and starts building.
4. Once the first build kicks off, click the service and:
   - **Variables tab** → add:
     - `JWT_SECRET` — long random string (e.g. `openssl rand -hex 48`). **Required.** The server refuses to boot in production without it.
     - `NODE_ENV` — `production` (Dockerfile already sets this, but harmless to set again)
     - *(optional)* `CORS_ORIGIN` — set to your custom domain once you add one. Leave unset for `*`.
   - **Settings → Networking** → click **Generate Domain**. You'll get something like `mrpg-production-XXXX.up.railway.app`.
   - **Settings → Volumes** → **+ New Volume**:
     - Mount path: `/data`
     - Size: 1 GB is plenty for SQLite during v1
     - **Without this volume, every redeploy wipes all accounts and characters.**
5. Once the first build completes, the deploy will restart with the volume attached. Open the generated domain — you should see the Aetheria login screen.

## Option B — Railway CLI

```bash
cd "C:\Users\Zen See\aetheria"

railway login                  # browser window opens
railway init                   # create new project, give it a name
railway up                     # deploy the current directory

# Set required env var
railway variables --set JWT_SECRET="$(openssl rand -hex 48)"

# Generate a public domain
railway domain

# Add a persistent volume (CLI doesn't fully manage volumes — easier in dashboard)
# Visit the dashboard, Settings → Volumes → mount /data
```

## Verifying it works

- `https://YOUR-DOMAIN.up.railway.app/api/health` → `{"ok":true,"time":...}`
- `https://YOUR-DOMAIN.up.railway.app/` → Aetheria login screen
- Register, create a hero, walk to the meadow, kill a slime
- Open the same domain in a second browser to confirm multiplayer

## Cost

- Hobby plan: $5/mo includes $5 of usage credits
- This image idle uses ~80MB RAM, 1 vCPU; with no players it'll cost roughly $1–3/mo. Active players add bandwidth + CPU but stay well under most starter budgets.

## Troubleshooting

**Build fails on `better-sqlite3`** — the Dockerfile installs `python3 make g++` in the build stage; if Railway changed something, check the build log for `gyp`/`make` errors. The runtime stage is slim (no build tools) which is intentional.

**"Cannot GET /" after deploy** — means `client/dist` didn't get copied. Check the build log; the line `serving static client from /app/client/dist` should appear at server startup. If not, the client build step in the Dockerfile failed silently.

**Sockets disconnect every ~30s** — Railway should support WebSockets out of the box, but make sure your client connects via the same origin (the bundled client does — it uses relative URLs).

**Lost data after redeploy** — you forgot the `/data` volume. Mount it; existing data on the previous ephemeral disk is gone, but new accounts will persist.

**JWT_SECRET missing** — server logs will say `JWT_SECRET must be set in production` and the container will crash-loop. Set the env var.

## v2 deploy notes (when you add crypto)

- Move SQLite → Postgres (Railway's managed Postgres, one click). Free tier of Neon also works.
- Split front-end onto its own static-host service (Vercel or Cloudflare Pages) for cheaper bandwidth.
- Put websocket server behind Cloudflare WS-aware proxy.
- Wallet integration → backend signing service in its own container with **scoped IAM**, not the same container as the game.
