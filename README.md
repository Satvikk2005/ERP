# Rush ERP — production build

> **ERP update (dashboard + projects):** WorkTrack is now a company-wide ERP. After login you land on a **Dashboard** of all projects, with Open / Paused / Closed counts across the top and a department filter. **＋ New Project** (top-right) creates a project — the creator is automatically its project manager, you pick which employees to assign from the existing roster, and projects are department-scoped. Clicking a project opens it, where the manager or an admin can switch its status and edit members. A left **sidebar** has **Home** (the dashboard) and an admin-only **Users** section listing every employee with their contact info and work updates. A **📝 Work Update** button (next to New Project) lets anyone log their daily update.
>
> **Bootstrap admin:** on every boot the API runs all SQL migrations and ensures one admin account exists. Defaults are name `Satvikk` / password `2005` (log in with either the name or the email `satvikk@rush.local`). Override via env vars `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_CODE`. **Change the default password after first login** — it's a bootstrap credential, not a permanent one. Because migrations run automatically at startup, a Render/VPS redeploy needs no manual `npm run migrate` step (it remains available for one-off local runs).

---

## Original deployment guide (self-hosted on Hostinger VPS)

> **Update:** this build now runs entirely on your own server via Docker — Postgres, the API, and the frontend all live in containers on one VPS. No Supabase, Render, or Vercel involved. If you previously set up Supabase, you can ignore those steps below; skip straight to "Deploying on a Hostinger VPS."


This is a rebuild of your WorkTrack prototype as a real client/server app:

- **Backend**: Node.js + Express REST API, PostgreSQL database, JWT auth, bcrypt password hashing, role-based access control.
- **Frontend**: same visual design as your original file, now calling the real API instead of `localStorage`.
- **Auth model**: every employee has their own account and password (no more shared login). Roles are `employee`, `manager`, `admin`. Only `manager`/`admin` can open the Progress Report.

## What changed vs. the prototype, and why

| Prototype | This build | Why |
|---|---|---|
| One shared password for everyone | Individual accounts, bcrypt-hashed passwords | Anyone with the old password could submit as the CEO or read everyone's report |
| Data in browser `localStorage` | PostgreSQL on a managed cloud host | localStorage is per-browser, per-device — not a real shared company database |
| Manager report gated by the same shared password | Gated by `manager`/`admin` role on the server, enforced on every request | Client-side checks can be bypassed; server-side checks can't |
| No rate limiting | Login is rate-limited, accounts lock after 5 failed attempts | Slows down password-guessing attacks |
| — | Forced password reset on first login | Temporary passwords shouldn't become permanent ones |
| — | Audit log table (`audit_log`) | Lets you see who logged in and who viewed whose report |

## Project layout

```
worktrack/
  backend/            Node/Express API + PostgreSQL schema + seed script
  backend/Dockerfile  Container build for the API
  frontend/           Static site (index.html + config.js) — served by Nginx
  nginx/default.conf  Serves the frontend + reverse-proxies /api to the backend
  docker-compose.yml  Runs Postgres + backend + Nginx together
  .env.example        Root-level secrets for docker-compose
```

Everything (database, API, static frontend) runs as three Docker containers on one VPS: `db`, `backend`, `nginx`. Nginx is the only container exposed to the internet — it serves the frontend directly and reverse-proxies `/api/*` to the backend over Docker's internal network, so the frontend and API share one origin and you never have to fight CORS in production.

---

## Step-by-step: deploying for $0/month (free tiers)

Use this path if the budget isn't approved yet. Same code, same architecture — just hosted on free tiers instead of a paid VPS. Honest tradeoff: the free backend tier "sleeps" after ~15 minutes of no traffic, so the first request after a quiet period takes 20–50 seconds to wake up. Fine for a demo or early pilot; upgrade to the Hostinger VPS path above once daily use matters.

### 1. Free database — Neon

1. Go to neon.tech, sign up (no credit card required), create a project called `worktrack`.
2. On the project dashboard, copy the **connection string** — looks like `postgres://user:pass@ep-xxxx.neon.tech/worktrack?sslmode=require`.
3. That's your `DATABASE_URL`. Neon requires SSL, so leave `DB_SSL` unset (default is SSL-on).

(Supabase works the same way if you already started there — see the earlier conversation for where to find its connection string.)

### 2. Free backend hosting — Render

1. Push the `backend/` folder to a GitHub repo (private is fine — Render can access private repos once you connect your GitHub account).
2. On render.com: **New → Web Service** → connect the repo → select the `backend` folder as the root if prompted.
3. Build command: `npm install`. Start command: `npm start`. Choose the **Free** instance type.
4. Under Environment, add:
   - `DATABASE_URL` = the Neon connection string from step 1
   - `JWT_SECRET` = generate with `openssl rand -base64 48`
   - `JWT_EXPIRES_IN` = `8h`
   - `CORS_ORIGIN` = leave a placeholder for now, e.g. `http://localhost` — you'll update it in step 4
   - `SEED_EMAIL_DOMAIN` = your real company email domain
5. Deploy. Render gives you a URL like `https://worktrack-api-xxxx.onrender.com`. Visit `<that-url>/health` and confirm you see `{"ok":true,...}`.
6. Run the one-time setup against this database. Easiest way: temporarily add `DATABASE_URL` to a local `.env` on your own machine (same value as step 1) and run:
   ```bash
   cd backend
   npm install
   npm run migrate
   npm run seed
   ```
   This creates the tables and loads your employee roster directly into the Neon database, from your laptop, one time. Delete that local `.env` afterward — don't leave production secrets sitting on your laptop. `seeded-credentials.csv` will appear locally; distribute those temp passwords securely, then delete the file.

### 3. Free frontend hosting — Vercel

1. Edit `frontend/config.js` and set `window.WORKTRACK_API_BASE` to your Render URL from step 2, e.g. `https://worktrack-api-xxxx.onrender.com`.
2. Push `frontend/` to a repo (can be the same repo, different folder).
3. On vercel.com: **New Project** → import the repo → set the root directory to `frontend` → no build command needed, it's plain static files → Deploy.
4. You'll get a URL like `https://worktrack-yourco.vercel.app`.

### 4. Connect the two — fix CORS

1. Go back to Render → your backend service → Environment → set `CORS_ORIGIN` to your exact Vercel URL from step 3 (e.g. `https://worktrack-yourco.vercel.app`, no trailing slash).
2. Save — Render redeploys automatically.
3. Visit your Vercel URL, try logging in with a seeded temp password. If the very first request hangs for up to a minute, that's the free backend waking up from sleep — normal, not broken.

### 5. What to upgrade later, and when

- If daily use starts to feel slow because of the sleep/wake delay → move the backend to a paid Render tier (~$7/month) or the Hostinger VPS path.
- If you outgrow Neon's free storage cap (very unlikely for text-only work entries) → upgrade that plan alone, nothing else changes.
- The code doesn't change between the free and paid paths — only environment variables and where things are hosted.

---

## Step-by-step: deploying on a Hostinger VPS (paid, ~$6–15/month)

Use this path once the budget is approved and you want an always-on, no-sleep-delay setup with everything self-hosted on your own server.
### 1. Order and access the VPS

1. In Hostinger, order a **VPS** plan (any tier — this app is light; their smallest KVM plan is plenty to start).
2. Choose **Ubuntu 22.04** (or 24.04) as the OS template when it asks — plain OS, not one of their pre-installed app templates.
3. Once it's provisioned, Hostinger gives you the server's **IP address** and a **root password** (or lets you add an SSH key — prefer that if offered).
4. Connect to it:
   ```bash
   ssh root@YOUR_SERVER_IP
   ```
   On Windows, use PowerShell, or Hostinger's in-browser terminal (in hPanel → VPS → your server → "Browser terminal") if `ssh` isn't set up locally yet.

### 2. Basic server hardening (do this before anything else)

```bash
# Create a non-root user to work as, instead of staying as root
adduser deploy
usermod -aG sudo deploy

# Basic firewall: only allow SSH, HTTP, HTTPS
apt update && apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to the new user for everything else
su - deploy
```

### 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in (or run: newgrp docker) for the group change to apply
```

Confirm:
```bash
docker --version
docker compose version
```

### 4. Get the project onto the server

Easiest path — from your own machine, zip the `worktrack` folder and upload it:

```bash
# from your local machine, in the folder containing worktrack/
scp -r worktrack deploy@YOUR_SERVER_IP:/home/deploy/
```

(Or push it to a private GitHub repo and `git clone` it on the server — better long-term if the founder wants version history.)

### 5. Configure environment variables

```bash
cd /home/deploy/worktrack
cp .env.example .env
nano .env
```

Fill in:
- `POSTGRES_PASSWORD` — generate one: `openssl rand -base64 24`
- `JWT_SECRET` — generate one: `openssl rand -base64 48`
- `CORS_ORIGIN` — set to `http://YOUR_SERVER_IP` for now (you'll change this to a real domain later)
- `SEED_EMAIL_DOMAIN` — your real company email domain

### 6. Build and start everything

```bash
docker compose up -d --build
docker compose ps        # all three services should show "running"/"healthy"
```

Run the migration and seed **once**, inside the running backend container:

```bash
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

The seed step prints temp passwords to a file *inside* the container. Copy it out so you can distribute credentials, then delete it from the container:

```bash
docker compose cp backend:/app/seeded-credentials.csv ./seeded-credentials.csv
docker compose exec backend rm /app/seeded-credentials.csv
```

Treat `seeded-credentials.csv` on your local machine as sensitive — distribute the passwords securely, then delete the file.

### 7. Test it

Visit `http://YOUR_SERVER_IP` in a browser. You should see the WorkTrack login screen. Log in with a row from `seeded-credentials.csv`, set a real password when prompted, and confirm you can submit a work update.

### 8. Put a real domain on it + HTTPS

1. In your domain's DNS (wherever it's registered — could also be Hostinger), add an **A record** pointing e.g. `worktrack.yourcompany.com` → `YOUR_SERVER_IP`.
2. Wait for DNS to propagate (a few minutes to an hour), then confirm: `ping worktrack.yourcompany.com` should show your server's IP.
3. Install Certbot and get a free HTTPS certificate:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```
   Since Nginx is running *inside* Docker here rather than directly on the host, the simplest approach is to temporarily stop the `nginx` container, get the cert with Certbot's standalone mode, then wire the cert paths into the Nginx config:
   ```bash
   docker compose stop nginx
   sudo certbot certonly --standalone -d worktrack.yourcompany.com
   ```
   This saves the certificate to `/etc/letsencrypt/live/worktrack.yourcompany.com/`.
4. Update `nginx/default.conf` to add a second `server` block listening on 443 with `ssl_certificate` / `ssl_certificate_key` pointing at those paths, and mount `/etc/letsencrypt` into the nginx container in `docker-compose.yml` (`- /etc/letsencrypt:/etc/letsencrypt:ro`). Ask me for the exact config once you're at this step and I'll write it out for your domain.
5. Update `CORS_ORIGIN` in `.env` to `https://worktrack.yourcompany.com`, then `docker compose up -d --build backend`.
6. Set up auto-renewal (Certbot installs a systemd timer by default — confirm with `sudo systemctl list-timers | grep certbot`).

### 9. Before rolling this out to the company

- [ ] Delete `seeded-credentials.csv` after distributing passwords.
- [ ] Confirm every employee is forced through "set a new password" on first login (automatic — `must_reset_pw` starts `true`).
- [ ] Decide who besides the CEO gets `manager`/`admin` access.
- [ ] Set up automated Postgres backups — the DB lives in a Docker volume (`db_data`) on this one server, so **back it up off the server too**:
  ```bash
  # simple daily dump, e.g. via cron
  docker compose exec -T db pg_dump -U worktrack worktrack > backup-$(date +%F).sql
  ```
  Copy these off-box (e.g. to Hostinger's backup storage, S3, or another machine) — a single-VPS setup has no redundancy if the disk fails.
- [ ] Consider Hostinger's own VPS snapshot/backup feature in hPanel as a second safety net.

### 10. Ongoing operations

- **Logs**: `docker compose logs -f backend` (or `nginx`, `db`). Watch for repeated `login_failed` entries in the `audit_log` table — that's what brute-force attempts look like.
- **Restarting after a code change**: `docker compose up -d --build`
- **Rotating the JWT secret**: change `JWT_SECRET` in `.env`, then `docker compose up -d --build backend` — this instantly logs everyone out.
- **Adding a new employee**: `POST /api/employees` (admin only) creates the account and returns a one-time temporary password.
- **Someone leaves the company**: `PATCH /api/employees/:id/status { "isActive": false }` — don't delete their row, or their work history goes with it.
- **Disk fills up**: Docker images/volumes can accumulate — `docker system prune` clears unused ones (won't touch the running `db_data` volume).

---

## Security notes for whoever maintains this

- Passwords are hashed with bcrypt (cost factor 12), never stored or logged in plaintext.
- Login is rate-limited (10 attempts / 15 min / IP) and accounts lock for 15 minutes after 5 failed attempts.
- All SQL uses parameterized queries — no string-concatenated SQL, so no SQL injection surface.
- The manager report endpoints check the caller's role **on the server** on every request, not just in the UI.
- `helmet` sets standard protective HTTP headers; CORS is locked to your frontend's exact origin.
- The JWT is stored in `sessionStorage` (cleared when the tab closes) rather than `localStorage`, to reduce the window an XSS bug could steal it in. For a more hardened setup later, move to an httpOnly cookie + CSRF token — flagged here as a known upgrade path, not done in this MVP to keep the API stateless and simple to host.
