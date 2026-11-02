# Cloudflare Pages deployment instructions

This package is converted from the Netlify version for **Cloudflare Pages**.
Your Google Apps Script backend and Google Sheet stay the same.

## Before you start

You need:
- Your existing working Google Apps Script Web App URL (the one ending in `/exec`).
- A GitHub account.
- A Cloudflare account.

**Important:** Create this as a Git-integrated Cloudflare Pages project. Do not choose Direct Upload for this package, because the `functions` folder must be deployed as a Pages Function.

## Step 1 — Put the project on GitHub

1. Download and extract `office-attendance-cloudflare-pages.zip`.
2. On GitHub, create a new repository. You can name it `office-attendance`.
3. Upload the *contents* of the extracted folder to the repository's main/root level.
4. Check that `index.html`, `app.js`, `style.css`, and the `functions` folder are visible at the top level. The `functions` folder must contain `api.js`.

Do not upload the outer containing folder as an extra nested level.

## Step 2 — Create the Cloudflare Pages project

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Choose **Create application** (or **Create**) → **Pages**.
4. Choose **Connect to Git**.
5. Select the GitHub repository you just created and authorize access if requested.
6. In the build settings, use:
   - **Framework preset:** None
   - **Build command:** `exit 0`
   - **Build output directory:** `.`
   - **Root directory:** leave as `/` or the repository root.
7. Start the deployment and wait for it to finish.

Cloudflare will publish the static website and deploy `functions/api.js` as the `/api` endpoint.

## Step 3 — Add your Google Apps Script URL

1. Open your new Pages project in Cloudflare.
2. Go to **Settings** → **Variables and Secrets** (sometimes shown under **Environment variables**).
3. Under **Production**, add this variable:
   - **Variable name:** `GAS_WEB_APP_URL`
   - **Value:** paste your existing Google Apps Script Web App URL ending in `/exec`.
4. Save the setting.
5. Go to **Deployments** and trigger a new deployment (or make a small commit to GitHub) so the new variable is available to the deployed function.

Keep this URL private. Do not put it in `app.js` or any public file.

## Step 4 — Test the attendance system

1. Open the Cloudflare Pages URL.
2. Log in as an employee.
3. Check that the employee dashboard loads.
4. Test punch-in / punch-out when you are physically at the office.
5. Log in as an admin and check the admin dashboard and attendance records.

If the site opens but login says the backend URL is not configured, check that `GAS_WEB_APP_URL` was added to the **Production** environment and redeploy.

If the backend cannot be reached, confirm that the Apps Script deployment is still active and that its access setting allows the web app to be called as configured in your existing working setup.

## Important — do not change your existing backend

- Do **not** create a new Google Sheet.
- Do **not** run `setupDatabase()` again.
- Do **not** run `upgradeAttendanceFeatures()` again.
- Do **not** change your existing Apps Script deployment URL.
- Do **not** delete your existing Netlify site until the Cloudflare version has been fully tested.

Your attendance data remains in the same Google Sheet. The Cloudflare site is only replacing the frontend hosting and API proxy.

## Project structure

The repository root should look like this:

```text
index.html
app.js
style.css
Code.gs
SETUP.md
UPDATE-INSTRUCTIONS.md
UPDATE-FIXES.md
UI-REDESIGN-INSTRUCTIONS.md
functions/
  api.js
```

`Code.gs` is included for reference only. It is not uploaded or executed by Cloudflare; it remains in your existing Google Apps Script project.
