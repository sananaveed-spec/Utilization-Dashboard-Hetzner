# Deploy Utilization Dashboard on Hetzner (Coolify)

Docker access on the server is resolved when `docker ps` works as your user without `sudo`.

This app is a Next.js container (see `Dockerfile`) with JSON files under `DATA_DIR`. Deploy with **Coolify** on `ubuntu-4gb-sin-2`.

## How deployment works (local → GitHub → server)

Your teammate’s flow:

1. **Work locally** (this repo on your PC)
2. **Commit + push** to GitHub (`main`)
3. **Server pulls from GitHub** (Coolify uses an SSH deploy key) and rebuilds

You do **not** upload files over SCP for normal updates. GitHub is the source of truth; Coolify auto-picks new commits.

Repo: `https://github.com/sananaveed-spec/Utilization-Dashboard-Hetzner`

### Connect GitHub to Coolify via SSH (one-time)

1. In Coolify → **Sources** (or **Git** / private keys): generate or paste an **SSH deploy key** for this app
2. On GitHub → repo **Settings** → **Deploy keys** → **Add deploy key**
   - Paste the **public** key Coolify shows
   - Allow read access (write not required for deploy)
3. In Coolify → Application → set repository to:
   - SSH URL: `git@github.com:sananaveed-spec/Utilization-Dashboard-Hetzner.git`
   - Branch: `main`
4. Enable **Auto Deploy** (deploy on push / webhook) so a push to `main` triggers build + restart
5. Click **Deploy** once to confirm the server can clone via SSH

If Auto Deploy is off, after each push either click **Deploy** in Coolify or on the server:

```bash
cd /path/to/app   # only if you maintain a bare git checkout outside Coolify
git pull origin main
# then rebuild via Coolify UI (preferred) or docker compose build/up
```

### Day-to-day (developers)

```bash
git add .
git commit -m "Your message"
git push origin main
```

Coolify pulls that commit and redeploys. Keep `DATA_DIR` / volume mounted so JSON data is not wiped.

## Prerequisites

1. Repo connected in Coolify with SSH deploy key (see above)
2. Coolify UI open on the Hetzner server
3. Azure AD app registration you can edit (redirect URIs)
4. Timesheets API token and organization id

## 1. Create the application in Coolify

1. **New Resource** → **Application**
2. Connect `Utilization-Dashboard-Hetzner` via SSH (branch: `main`) — see “Connect GitHub to Coolify via SSH”
3. Build pack: **Dockerfile** (repo root [`Dockerfile`](Dockerfile))  
   - Alternate: **Docker Compose** using [`docker-compose.yml`](docker-compose.yml) (volume `utilization-data` → `/app/data` is already declared)
4. Port: **3000**
5. Do **not** override the start command (image runs `node server.js`)
6. Turn on **Auto Deploy** so pushes to `main` rebuild automatically

Coolify settings that must match this repo:

| Setting | Value |
|---------|-------|
| Repository | `git@github.com:sananaveed-spec/Utilization-Dashboard-Hetzner.git` |
| Branch | `main` |
| Build pack | Dockerfile |
| Dockerfile location | `/Dockerfile` |
| Ports exposes | `3000` |
| Persistent storage destination | `/app/data` |
| Auto Deploy | On |

## 2. Persistent volume for JSON data

Without a volume, entries/engineers are wiped on every redeploy.

1. In the Coolify app → **Persistent Storage** (or Volumes)
2. Add a volume:
   - **Name:** `utilization-data` (any name)
   - **Destination path:** `/app/data`
3. Set env `DATA_DIR=/app/data` (also the Dockerfile default)

### Optional: seed existing data once

After the first successful deploy, if you need local `data/*.json` on the server:

```bash
# On the Hetzner host (adjust container name from `docker ps`)
docker cp ./entries.json <container>:/app/data/entries.json
docker cp ./engineers.json <container>:/app/data/engineers.json
docker cp ./holidays.json <container>:/app/data/holidays.json
docker cp ./allowed-users.json <container>:/app/data/allowed-users.json
docker cp ./calendar-year-range.json <container>:/app/data/calendar-year-range.json
```

Or copy the whole folder into Coolify’s volume path on the host.

## 3. Environment variables

Copy values from [`coolify.env.template`](coolify.env.template) into Coolify → **Environment Variables**.

| Variable | Example / notes |
|----------|-----------------|
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | Azure AD application (client) id |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | Azure AD directory (tenant) id |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | `allumiax.com` |
| `NEXT_PUBLIC_AZURE_AUTHORITY` | Optional; default organizations authority |
| `DATA_DIR` | `/app/data` |
| `TIMESHEETS_API_TOKEN` | SolidTime / Timesheets API token |
| `TIMESHEETS_ORGANIZATION_ID` | Organization id |
| `TIMESHEETS_TIMEZONE` | `America/Los_Angeles` |
| `TIMESHEETS_API_BASE_URL` | Optional; default `https://timesheets.allumiax.com/api/v1` |

`NEXT_PUBLIC_*` values are baked into the client bundle at **build** time. Set them before the first deploy (or rebuild after changing them).

## 4. Domain and HTTPS

1. Coolify → **Domains**: add your hostname (or use Coolify’s generated URL)
2. Enable HTTPS (Let’s Encrypt) or terminate TLS via Cloudflare Tunnel if you prefer that pattern
3. Note the final public origin, e.g. `https://utilization.example.com`

## 5. Azure AD redirect URIs

MSAL uses `window.location.origin` as `redirectUri` / `postLogoutRedirectUri`.

In [Azure Portal](https://portal.azure.com) → App registrations → your app → **Authentication**:

1. Add a **Single-page application** redirect URI: `https://YOUR_PUBLIC_HOST`
2. Also add the same URI under logout / front-channel logout if required by your tenant
3. Keep any local `http://localhost:3000` URI for development

Save, then wait a minute for propagation.

## 6. Deploy and verify

1. Push to `main` (or Coolify → **Deploy** if Auto Deploy is off)
2. Wait for Coolify build to finish (SSH pull from GitHub + Docker build)
3. Open the public URL → sign in with an `@allumiax.com` account
4. Create or edit an entry
5. Coolify → **Restart** (or redeploy) and confirm the data is still there (volume works)

### Quick health checks on the server

```bash
docker ps | grep -i utilization
docker logs <container> --tail 100
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails on `npm run build` | Ensure `package-lock.json` is committed; check Coolify build logs |
| Login redirect error | Azure SPA redirect URI must exactly match the public origin (https, no trailing slash mismatch) |
| Data resets after deploy | Volume not mounted on `/app/data`, or wrong `DATA_DIR` |
| Timesheets empty / API errors | Check `TIMESHEETS_API_TOKEN` and `TIMESHEETS_ORGANIZATION_ID` |
| `permission denied` on Docker | User must be in `docker` group; re-login after `usermod -aG docker $USER` |
