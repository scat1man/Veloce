# Putting VELOCÉ online for free

This guide takes you from nothing to a public link such as `https://veloce.onrender.com`
that you can send to clients. It is written for Windows. Commands are for **PowerShell**
(Start menu → type "PowerShell" → open it).

**What you will use (all free):**

| Service | What it does | Card needed? |
|---|---|---|
| [GitHub](https://github.com) | Stores your code online | No |
| [Render](https://render.com) | Runs the website from that code | No for the free plan |

**What "free" means here:** the site goes to sleep after 15 minutes without visitors, and
the first visit after that takes about a minute to wake it up. Bookings made on the demo are
**deleted whenever the site restarts, sleeps or is updated**. That is fine for a showcase. If
you need bookings to be kept, see [Keeping bookings permanently](#keeping-bookings-permanently).

---

## Part 1 — Put the code on GitHub

### 1. Create a GitHub account
Go to <https://github.com/signup> and create an account. Confirm your email.

### 2. Install Git
In PowerShell:

```powershell
winget install --id Git.Git -e
```

Close PowerShell and open it again, then check it worked:

```powershell
git --version
```

(If `winget` is not found, download the installer from <https://git-scm.com/download/win>
and accept the default options.)

### 3. Tell Git who you are (once per computer)

```powershell
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

### 4. Go to the project folder
Use the folder that contains `package.json`. For example:

```powershell
cd "C:\Users\YOU\Documents\veloce"
```

### 5. Create the first commit

```powershell
git init
git add .
git status
```

Read the list `git status` prints **before** going on. It must **not** contain:

- `.env` (passwords and secrets)
- `node_modules` or `dist`
- `server/data` or any `.db` file (customers' booking details)
- the large original car files such as `mc_laren_750s.glb` or `法拉利SF90 Stradale.glb`

The `.gitignore` file in the project already excludes all of these. The large original
`.glb` files (114–163 MB each) are over GitHub's 100 MB limit and the website never loads
them; it uses the small copies in `public/models/web/`, which *are* included. Keep the
originals on your own computer as a backup.

Double-check that only the small model copies are included:

```powershell
git ls-files "*.glb"
```

Every line should start with `public/models/web/`. Then commit:

```powershell
git commit -m "VELOCÉ website"
```

### 6. Create an empty repository on GitHub
1. Go to <https://github.com/new>.
2. Repository name: `veloce`.
3. Choose **Private** (recommended: clients see the website, not your code). Render works with private repositories.
4. Do **not** tick "Add a README", ".gitignore" or "license". Click **Create repository**.

### 7. Upload (push) the code
Replace `YOUR-USERNAME` with your GitHub username:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/veloce.git
git push -u origin main
```

A browser window opens asking you to sign in to GitHub; approve it. Refresh the GitHub
page: your files are there (about 32 MB).

---

## Part 2 — Run it on Render

### 8. Choose an admin password
The concierge page (`/admin`) shows every booking with names, emails and phone numbers,
so it needs a strong password. The server **refuses to start** in production if the password
is missing, shorter than 12 characters, or the demo default `veloce`.

Generate a random 24-character password in PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
```

Copy it into your password manager (or somewhere safe). Never put it in a file in the project.

### 9. Create a Render account
Go to <https://dashboard.render.com/register> and sign up **with GitHub** (easiest).

### 10. Create the web service

**Option A — one click with the Blueprint (uses the `render.yaml` in the project):**

1. In Render, click **New +** → **Blueprint**.
2. Connect your GitHub account if asked, and pick the `veloce` repository.
3. Render reads `render.yaml` and asks for `ADMIN_PASSWORD`: paste the password from step 8.
4. Click **Apply** (or **Deploy Blueprint**).

If Render asks for a credit card at this point, cancel and use Option B instead.

**Option B — fill in the form yourself:**

1. Click **New +** → **Web Service** → pick the `veloce` repository.
2. Fill in:

   | Field | Value |
   |---|---|
   | Name | `veloce` (becomes `veloce.onrender.com`; pick another if taken) |
   | Region | The one closest to your clients (e.g. Singapore for India, Frankfurt for Europe) |
   | Branch | `main` |
   | Runtime / Language | Node |
   | Build Command | `npm ci --include=dev && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

3. Under **Environment Variables** add:

   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `NODE_ENV` | `production` |
   | `ADMIN_PASSWORD` | the password from step 8 |
   | `TRUST_PROXY` | `1` |

4. Under **Advanced**, set **Health Check Path** to `/api/health`.
5. Click **Create Web Service**.

Why `--include=dev`: with `NODE_ENV=production`, npm skips "development" packages, but the
build step (TypeScript and Vite) needs them.

### 11. Wait for the first deploy
Watch the **Logs** tab. The build takes a few minutes. It is done when you see
`Your service is live` and the status turns green.

If it fails with an `ADMIN_PASSWORD` message, the password is missing or too short:
fix it under **Environment** → it redeploys automatically.

### 12. Check that it works
Replace the address with yours:

1. <https://veloce.onrender.com/api/health> → shows `{"ok":true}` (or similar).
2. <https://veloce.onrender.com> → the website, cars load, you can scroll through it.
3. Make a test booking with the **Book a drive** form. You get a reference number.
4. <https://veloce.onrender.com/admin> → sign in with your admin password; your test booking is listed.

Before a client meeting, open the site yourself a minute early so it is awake.

---

## Part 3 — Day to day

### Updating the site later
Change files on your computer, then:

```powershell
git add .
git status
git commit -m "Describe what you changed"
git push
```

Render notices the push and redeploys by itself within a few minutes (watch the **Events** tab).

### Changing the admin password
Render → your service → **Environment** → edit `ADMIN_PASSWORD` → **Save**. It restarts with
the new password.

### Booking emails (optional)
With this on, guests get an email when they send a request and again when you confirm or
decline it in the console, and you get one for every new request. Without it the site works
the same, just silently. Render's free plan blocks normal mail servers (SMTP), so the site
sends through **Brevo**, which works over HTTPS and is free for 300 emails a day. No domain needed.

1. Sign up at <https://www.brevo.com> (free plan).
2. **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**: enter the name guests
   should see and your email address (a Gmail works). Click the link Brevo emails you.
3. Top-right menu → **SMTP & API** → **API Keys** → **Generate a new API key**. Copy it.
4. Render → your service → **Environment** → add:

   | Key | Value |
   |---|---|
   | `BREVO_API_KEY` | the key from step 3 |
   | `EMAIL_FROM` | the sender address you verified in step 2 |
   | `OWNER_EMAIL` | where new requests should go (guests' replies land here too) |

5. **Save**. Render restarts the site; make a test booking with your own email.

Not arriving? Check spam first, then Render → **Logs** and search for `[email]`: it shows
what Brevo answered (an unverified sender is the usual cause). Links in the emails point to
your Render address; set `SITE_URL` if you add your own domain. Optional: `EMAIL_FROM_NAME`
(default `VELOCÉ`). For a client with their own domain, Resend also works: set
`RESEND_API_KEY` instead of `BREVO_API_KEY`, with an `EMAIL_FROM` on that verified domain.

### Free plan limits in practice
- **Sleep:** after 15 minutes without visitors it sleeps; the next visitor waits about 1 minute.
- **750 free hours per month** across all your free services — enough for one site running all month.
- **Bandwidth:** about 5 GB/month free. Each first visit downloads roughly 5–15 MB (3D cars and
  photos, cached afterwards), so this covers several hundred visits — plenty for a showcase.
- **Data:** the disk is wiped on every restart, sleep and update, so demo bookings disappear.
- **Speed:** 0.1 CPU and 512 MB memory. Fine for a demo; not for a busy real business.

Source: <https://render.com/docs/free>.

### A custom domain (optional)
The free `something.onrender.com` address works with HTTPS already. To use your own domain
(bought from any registrar, ~$10/year): Render → your service → **Settings** → **Custom Domains**
→ **Add**, then copy the DNS records Render shows into your registrar's DNS page. Render issues
the HTTPS certificate automatically.

---

## Keeping bookings permanently

The free Render plan cannot keep files. When you sell a site to a real client, pick one:

1. **Render paid plan + disk (simplest, ~$7/month + ~$0.25/GB):** upgrade the service to
   *Starter*, add a **Disk** with mount path `/var/data`, and add the environment variable
   `DATA_DIR=/var/data`. Bookings now survive restarts and updates.
2. **Oracle Cloud "Always Free" virtual machine (free, but more technical):** a small Linux
   server that never sleeps and has up to 200 GB of permanent disk. Needs a card for identity
   checks (not charged), and you install Node 22 and keep the server updated yourself.
   Oracle may reclaim machines that sit almost idle for 7 days.
   <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
3. **A hosted database (e.g. Turso, free tier with no card):** keeps data outside the server,
   but the app's database code would need changing to use it.

---

## Before showing it to clients — checklist

- [ ] **Your credit line:** in `src/data/content.ts`, fill in
      `export const credit = { label: 'Website by Your Studio', url: 'https://your-site' }`.
- [ ] **Contact details:** in the same file, replace the placeholder `email`
      (`concierge@veloce.example`) and `phone` (`+1 (310) 555-0148`) with real ones, or keep them
      clearly fictional for a demo.
- [ ] **`ADMIN_PASSWORD`** is set on Render to a long random value (step 8).
- [ ] Test the booking form and `/admin` on your phone and laptop.
- [ ] **Third-party content (read this before selling):**
  - The **Aston Martin DB12** 3D model is licensed **CC BY-NC-SA 4.0 — NonCommercial**.
    Using it on a site whose purpose is to sell your services is arguably commercial use.
  - The **Ferrari SF90** 3D model came with **no licence information**, so you have no
    stated permission to use it at all.
  - The other four car models are **CC BY 4.0**: allowed commercially as long as the authors
    stay credited (the footer does this).
  - The site shows real **manufacturer names and logos** (`public/brands/`). Those are
    trademarks; showing them on a fictional rental brand could suggest a partnership that
    doesn't exist.
  - **Safer options:** swap the DB12 and SF90 for models licensed CC BY or CC0 (on Sketchfab,
    filter by "Downloadable" and the licence; see `public/models/README.md` for how to swap),
    remove the logo files and logo display, and keep the "fictional brand" note in the footer.
    For a real client, use their own photos and vehicles.

  This isn't legal advice. It's a summary of the licence terms. If you're unsure, take
  the risky items out. That's the cheapest fix.
