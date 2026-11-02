# Office Attendance UI Redesign — Update Instructions

This package contains a visual redesign of the employee and admin portals.

## Important
- This is a frontend-only UI update.
- Your Google Apps Script backend, Google Sheet, attendance data, GPS rules, punch-in/out logic, and 11:00 PM auto punch-out are not changed.
- Do NOT replace `Code.gs` in Apps Script.
- Do NOT run `setupDatabase()` or `upgradeAttendanceFeatures()` for this UI update.
- Keep your existing Netlify environment variable `GAS_WEB_APP_URL` unchanged.

## Deploy the redesigned interface
1. Download and extract this ZIP.
2. Open your existing Netlify site.
3. Deploy the complete `office-attendance-system` folder as a new deploy (drag and drop the folder contents / use your normal Netlify deploy method).
4. Ensure `netlify.toml` and the `netlify/functions` folder are included.
5. Wait for Netlify to finish publishing, then refresh the website. If the old styles remain, do a hard refresh (Ctrl+Shift+R on Windows/Linux or Cmd+Shift+R on Mac).

No Apps Script deployment is required for this update.
