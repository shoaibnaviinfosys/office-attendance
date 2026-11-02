# Update your existing Office Attendance system

These steps upgrade the existing system. They do not create a new spreadsheet or delete attendance records.

## 1. Update Apps Script backend
1. Open the Google Sheet used by your current attendance system.
2. Open **Extensions → Apps Script**.
3. Open `Code.gs`, select all existing code, and replace it with the updated `Code.gs` supplied in this ZIP.
4. Save.
5. In the function selector, choose **`upgradeAttendanceFeatures`** and click **Run**.
6. Approve Google authorization. Wait for “Execution completed.”

This one-time upgrade adds three columns to the existing Attendance sheet: `InAccuracyMeters`, `OutAccuracyMeters`, and `PunchOutMethod`. It also installs one daily auto punch-out trigger. Existing attendance rows are preserved.

## 2. Publish the backend
1. Go to **Deploy → Manage deployments**.
2. Edit your existing Web App deployment.
3. Choose **New version** and click **Deploy**.
4. Keep the same Web App deployment URL.

## 3. Update Netlify frontend
Upload the complete extracted project folder from this ZIP to your existing Netlify site as a new deploy. Keep `netlify.toml` and the `netlify` folder. The existing `GAS_WEB_APP_URL` environment variable should remain unchanged because the Apps Script deployment URL is unchanged.

## 4. Verify the trigger
In Apps Script, open **Triggers** (clock icon). Confirm there is one daily trigger for `runDailyAutoPunchOut`. It runs late in the 11 PM hour in `Asia/Kathmandu`. If an employee has not punched out, the attendance record is closed using **11:00 PM** as the recorded punch-out time, and `PunchOutMethod` is set to `AUTO_MISSED_PUNCH_OUT`.

## 5. Test the new outside-office punch-out
Use a test employee who has punched in. Move outside the configured office radius and press the normal **Punch out** button. The warning should appear and the separate **Punch out outside office** button should become visible. Press it and allow GPS. Confirm the Attendance sheet records the punch-out time, latitude, longitude, accuracy and `OUTSIDE_OFFICE` method.

## Important
- Do not run `setupDatabase()` again on your live sheet.
- Do not delete or rename existing Attendance columns.
- Keep the Google Sheet private.
- GPS coordinates are browser-reported and are not spoof-proof.
- Apps Script time triggers are approximate, not guaranteed to execute at the exact minute. The saved auto punch-out time is fixed at 11:00 PM Kathmandu time.
