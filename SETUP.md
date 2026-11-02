# Office Attendance System — Setup Guide

This package contains a Netlify frontend, a Netlify serverless proxy, and a Google Apps Script + Google Sheets backend.

## Before you begin

You need:
- A Google account that owns the office attendance spreadsheet.
- A Netlify account.
- Your office latitude and longitude (Google Maps can show these).
- A modern phone browser with location permission.

**Password note:** You requested plain-text passwords. The Users sheet stores passwords as plain text. Anyone with access to that private spreadsheet can read them. Do not share the spreadsheet with employees or publish it.

## Part A — Create the Google Sheet

1. Create a blank Google Sheet named `Office Attendance`.
2. Open **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs`.
4. Open the supplied `Code.gs` file, copy all of it, and paste it into the Apps Script editor.
5. Click Save.
6. In the function selector, choose `setupDatabase` and click Run.
7. Approve Google's authorization prompts. This also installs the daily auto punch-out trigger.
8. Return to your spreadsheet. It should now contain these tabs:
   - Users
   - Attendance
   - Settings
   - Working Days
   - Sessions

### Create your first admin

In the `Users` tab, enter your first admin on row 2:

| UserID | Name | Password | Role | Active | CreatedAt |
|---|---|---|---|---|---|
| admin | Office Admin | YOUR-OWN-PASSWORD | admin | TRUE | leave blank |

Replace `YOUR-OWN-PASSWORD` with a strong unique password. Do not use the example password from the Apps Script log.

Add employee accounts in the same sheet or later from the admin dashboard. Use `employee` for employee roles and `admin` for admin roles. Active must be `TRUE` or `FALSE`.

## Part B — Deploy Google Apps Script

1. In Apps Script, click **Deploy → New deployment**.
2. Select the gear icon / deployment type **Web app**.
3. Description: `Office Attendance API`.
4. Execute as: **Me**.
5. Who has access: **Anyone**.
6. Click Deploy and authorize if asked.
7. Copy the Web app URL. It must end in `/exec`.

The endpoint is public so Netlify can call it. App actions still require a valid login session. Do not share the endpoint as a substitute for the app, and keep the spreadsheet private.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version → Deploy** so the live `/exec` deployment receives the update.

## Updating an existing installation with these features

If you already have the attendance system running, do **not** run `setupDatabase()` again and do not create a new spreadsheet.

1. Replace the entire contents of your existing Apps Script `Code.gs` with the updated `Code.gs` from this package and Save.
2. In the Apps Script function selector, choose `upgradeAttendanceFeatures` and click Run once. Approve the requested authorization. This adds the three new Attendance columns (`InAccuracyMeters`, `OutAccuracyMeters`, `PunchOutMethod`) without deleting existing records and installs the daily auto punch-out trigger.
3. Open **Deploy → Manage deployments → Edit** your existing Web App deployment. Select **New version** and click **Deploy**. Keep the same deployment and `/exec` URL.
4. Replace the Netlify site files with the updated `index.html`, `app.js`, and `style.css` (and keep the existing `netlify` folder and `netlify.toml`). You can upload the complete extracted project folder as a new manual deploy.
5. Netlify environment variable `GAS_WEB_APP_URL` does not need to change if you kept the existing Apps Script deployment URL.

The Apps Script trigger runs automatically after it is installed. To verify it, open Apps Script **Triggers** (clock icon) and confirm there is one daily trigger for `runDailyAutoPunchOut`.

## Part C — Deploy the website to Netlify

1. Unzip this package on your computer.
2. Sign in to Netlify.
3. Choose **Add new site → Deploy manually** or connect a Git repository containing the unzipped folder.
4. Upload the project folder (the folder containing `index.html`, `app.js`, `style.css`, `netlify.toml`, and the `netlify` folder).
5. In Netlify, open **Site configuration → Environment variables**.
6. Add:
   - Key: `GAS_WEB_APP_URL`
   - Value: paste your Google Apps Script `/exec` URL.
7. Save the variable.
8. Trigger a new deploy (Deploys → Trigger deploy → Deploy site).
9. Open the Netlify site URL. Use HTTPS; browser GPS generally requires a secure context.

## Part D — Configure your office

1. Log in with the admin account.
2. Open **Office settings**.
3. Enter:
   - Office name
   - Opening time (default 10:00)
   - Closing time (default 18:00; used for the absent summary only)
   - GPS permitted radius in metres (default 100)
   - Office latitude
   - Office longitude
   - Maximum GPS inaccuracy (default 100 metres)
   - Working days (Sunday–Friday selected; Saturday off)
4. Click **Save office settings**.

The time inputs use 24-hour values for accurate configuration (10:00 means 10 AM; 18:00 means 6 PM). The app displays times in 12-hour AM/PM format.

## Attendance rules

- Employees can sign in at any time.
- Punch-in is available at or after the configured office opening time and requires GPS inside the permitted office radius.
- Normal punch-out requires GPS inside the permitted office radius.
- If an employee is outside the office, the normal punch-out is rejected and a separate **Punch out outside office** button appears. This exception still requires a valid GPS reading and saves the employee's current latitude, longitude, GPS accuracy and punch-out time. It is marked `OUTSIDE_OFFICE` in the Attendance sheet and admin records.
- GPS readings whose reported accuracy is worse than the configured maximum are rejected for both punch-out paths.
- One punch-in and one punch-out are allowed per employee per working day.
- A daily Apps Script trigger automatically closes any missed punch-out at a fixed **11:00 PM Asia/Kathmandu** cutoff. It records 11:00 PM as the punch-out time, calculates worked minutes only up to that cutoff, and marks the record `AUTO_PUNCHED_OUT_MISSED`. The trigger runs late in the 11 PM hour; Apps Script scheduling is approximate, but the stored cutoff remains 11:00 PM.
- Older open records are also closed at 11:00 PM on their attendance date the next time the trigger runs.
- Saturday is off by default. The admin can change any working day.
- Absence is calculated in the admin dashboard after office closing time for enabled working days. It is not a separate stored attendance row.
- Weekly totals run Sunday through the current day; monthly totals run from the first day of the month.
- Worked time is elapsed time between punch-in and punch-out. Break deductions are not applied.

## Customisations included

- Office name
- Office opening and closing times
- GPS radius
- Office coordinates
- GPS accuracy threshold
- Working days
- Multiple admin accounts
- Employee account activation/deactivation
- Change user details and passwords
- Timezone fixed to Asia/Kathmandu
- 12-hour display format

## Important operational notes

1. **Keep the Google Sheet private.** Do not publish it or give employees Editor access. The app reads/writes it through the Apps Script owner account.
2. **Plain-text passwords are a security trade-off.** Anyone who can read the Users sheet can read every password. Ask employees not to reuse passwords from other services.
3. **GPS is not tamper-proof.** Browser geolocation and accuracy checks deter ordinary out-of-office punches but cannot guarantee detection of mock-location tools or modified devices.
4. **Location permission is required.** Employees must allow location access in their browser and use the HTTPS Netlify URL.
5. **No background tracking.** Location is requested only when an employee presses Punch in or Punch out.
6. **Forgotten punch-out:** The daily trigger closes any open record at the fixed 11:00 PM Kathmandu cutoff and flags it for admin review. Apps Script time triggers are approximate, so the job runs late in the 11 PM hour while recording the fixed 11:00 PM cutoff.
7. **Daily totals:** A currently open session is counted live for the current day; after automatic closure, the saved duration ends at 11:00 PM.
8. **Initial admin setup:** Add the first admin directly to the Users sheet before deploying the website.

## Pre-launch test checklist

Use a test employee account and check all of these before using it for real attendance:

- [ ] Admin can log in.
- [ ] Admin can create an employee.
- [ ] Employee can log in.
- [ ] Before opening time, punch-in is disabled and countdown is visible.
- [ ] At/after opening time, punch-in is enabled.
- [ ] Inside the office radius, punch-in succeeds.
- [ ] Outside the radius, punch-in is rejected with the location warning.
- [ ] Employee can punch out inside the office radius.
- [ ] Outside the radius, normal punch-out is rejected and the separate outside-office button appears.
- [ ] Outside-office punch-out saves GPS coordinates, accuracy, time and method in the Attendance sheet.
- [ ] Run `runDailyAutoPunchOut` manually in a controlled test only after 11 PM to verify a missed punch-out is marked `AUTO_PUNCHED_OUT_MISSED`.
- [ ] Second punch-in or second punch-out is rejected.
- [ ] Employee sees only their own history and totals.
- [ ] Admin sees team totals, attendance records and GPS coordinates.
- [ ] Admin can change the radius and working days.
- [ ] Saturday is treated as a non-working day by default.

## Limitations of this starter release

This is a practical small-office attendance starter, not a certified payroll or biometric system. It does not include leave approvals, holidays, break tracking, payroll, overtime rules, shift rotations, offline punches, or device anti-spoofing. Admin corrections are made directly in the private Attendance sheet. Test with your actual Google and Netlify accounts before inviting all staff.
