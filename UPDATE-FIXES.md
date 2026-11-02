# Updating an existing Office Attendance System

This update fixes:
- Office opening/closing times being converted by Google Sheets and appearing blank or incorrect.
- Duplicate setting keys being handled safely: saving now updates every matching row, and blank duplicate rows cannot erase valid settings when dashboards load.
- The employee punch-in countdown, now shown as remaining minutes plus a live hours/minutes/seconds display.
- Automatic browser-session restoration. The app now asks for a fresh user ID and password whenever the site is opened or refreshed.

## Important: update BOTH parts

The system has two separate parts. Updating only Netlify is not enough for the office-time fix.

### 1. Update Google Apps Script (backend)

1. Open the Google Sheet used by the attendance system.
2. Go to **Extensions → Apps Script**.
3. Open `Code.gs` in this extracted project folder.
4. Replace all existing code in the Apps Script editor with the complete contents of this updated `Code.gs`.
5. Click **Save**.
6. Open **Deploy → Manage deployments**.
7. Find the existing Web App deployment and click its pencil/Edit icon.
8. Under Version, choose **New version**, then click **Deploy**.
9. Keep using the same `/exec` URL if you edited the existing deployment. If you created a completely new deployment instead, update Netlify's `GAS_WEB_APP_URL` environment variable to the new `/exec` URL and redeploy Netlify.

Do **not** run `setupDatabase()` again. Your existing Users, Attendance, Settings, Working Days, and Sessions data should remain in place.

### 2. Update Netlify (website)

1. Extract this updated ZIP file.
2. Open the extracted `office-attendance-system` folder.
3. Upload that folder to your existing Netlify site's manual/drag-and-drop deploy area.
4. Wait for the deployment to finish successfully.
5. Open the site and hard-refresh it (Windows: Ctrl+Shift+R; Mac: Cmd+Shift+R).

Keep the existing `GAS_WEB_APP_URL` environment variable unchanged unless you created a new Apps Script deployment.

## Test checklist

1. Sign in as admin.
2. Open Office settings, set opening time to a test value such as `10:15`, and save.
3. Confirm the opening and closing time fields remain populated after the dashboard reloads.
4. Sign out, then sign in as an employee.
5. Before the opening time, confirm the employee page shows the remaining minutes and a live countdown.
6. After the opening time, confirm it says punch-in is available now.
7. Refresh the page. It should ask for credentials again rather than silently restoring the previous login.

Office times must be entered in 24-hour format, for example `09:30`, `10:15`, or `18:00`.
