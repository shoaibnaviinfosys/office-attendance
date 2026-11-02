/**
 * Office Attendance System — Google Apps Script backend
 * Timezone: Asia/Kathmandu
 *
 * IMPORTANT:
 * 1. Run setupDatabase() once.
 * 2. Add your first admin manually in the Users sheet.
 * 3. Deploy as a Web App: Execute as Me; access Anyone.
 * 4. Put the deployed /exec URL in Netlify environment variable GAS_WEB_APP_URL.
 *
 * Passwords are stored as plain text in the private Users sheet, as requested.
 * Keep the spreadsheet private. Never share it with employees.
 */

const APP = {
  TZ: "Asia/Kathmandu",
  SHEETS: {
    USERS: "Users",
    ATTENDANCE: "Attendance",
    SETTINGS: "Settings",
    DAYS: "Working Days",
    SESSIONS: "Sessions"
  },
  USER_HEADERS: ["UserID", "Name", "Password", "Role", "Active", "CreatedAt"],
  ATT_HEADERS: ["Date", "UserID", "Name", "PunchIn", "PunchOut", "InLatitude", "InLongitude", "OutLatitude", "OutLongitude", "WorkedMinutes", "Status", "CreatedAt", "UpdatedAt", "InAccuracyMeters", "OutAccuracyMeters", "PunchOutMethod"],
  SESSION_HEADERS: ["Token", "UserID", "ExpiresAt", "CreatedAt"],
  DEFAULT_SETTINGS: {
    OFFICE_NAME: "Main Office",
    OFFICE_LATITUDE: "",
    OFFICE_LONGITUDE: "",
    GPS_RADIUS_METERS: "100",
    OFFICE_START: "10:00",
    OFFICE_END: "18:00",
    TIMEZONE: "Asia/Kathmandu",
    MAX_GPS_ACCURACY_METERS: "100",
    REQUIRE_GPS_FOR_PUNCH_OUT: "TRUE"
  },
  DEFAULT_DAYS: [
    ["Day", "Working"],
    ["Sunday", true], ["Monday", true], ["Tuesday", true],
    ["Wednesday", true], ["Thursday", true], ["Friday", true],
    ["Saturday", false]
  ]
};

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Open this script from the Google Sheet: Extensions > Apps Script.");

  ensureSheet_(ss, APP.SHEETS.USERS, APP.USER_HEADERS);
  ensureSheet_(ss, APP.SHEETS.ATTENDANCE, APP.ATT_HEADERS);
  ensureAttendanceColumns_();
  ensureSheet_(ss, APP.SHEETS.SETTINGS, ["Key", "Value"]);
  ensureSheet_(ss, APP.SHEETS.DAYS, ["Day", "Working"]);
  ensureSheet_(ss, APP.SHEETS.SESSIONS, APP.SESSION_HEADERS);

  const settings = ss.getSheetByName(APP.SHEETS.SETTINGS);
  if (settings.getLastRow() < 2) {
    const rows = Object.keys(APP.DEFAULT_SETTINGS).map(k => [k, APP.DEFAULT_SETTINGS[k]]);
    settings.getRange(2, 1, rows.length, 2).setValues(rows);
  }

  const days = ss.getSheetByName(APP.SHEETS.DAYS);
  if (days.getLastRow() < 2) {
    days.getRange(1, 1, APP.DEFAULT_DAYS.length, 2).setValues(APP.DEFAULT_DAYS);
  }

  ss.setSpreadsheetTimeZone(APP.TZ);
  installDailyAutoPunchOutTrigger_();
  [APP.SHEETS.USERS, APP.SHEETS.ATTENDANCE, APP.SHEETS.SETTINGS, APP.SHEETS.DAYS, APP.SHEETS.SESSIONS]
    .forEach(n => {
      const sh = ss.getSheetByName(n);
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, Math.max(1, sh.getLastColumn()));
    });

  Logger.log("Database setup complete. Add your first admin in Users sheet, row 2:");
  Logger.log("UserID=admin | Name=Office Admin | Password=change-this-now | Role=admin | Active=TRUE");
  return "Setup complete. Add your first admin to the Users sheet and change the example password.";
}

function doGet() {
  return json_({ ok: true, app: "Office Attendance API", message: "Backend is running." });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "");
    let result;
    switch (action) {
      case "login": result = login_(body); break;
      case "logout": result = logout_(body); break;
      case "employeeDashboard": result = employeeDashboard_(body); break;
      case "punch": result = punch_(body); break;
      case "adminDashboard": result = adminDashboard_(body); break;
      case "saveSettings": result = saveSettings_(body); break;
      case "saveUser": result = saveUser_(body); break;
      case "toggleUser": result = toggleUser_(body); break;
      default: throw new Error("Unknown request.");
    }
    return json_({ ok: true, data: result });
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function login_(b) {
  const userId = clean_(b.userId).toLowerCase();
  const password = String(b.password || "");
  if (!userId || !password) throw new Error("Enter your user ID and password.");

  const users = getRows_(APP.SHEETS.USERS);
  const user = users.find(u => String(u.UserID).toLowerCase() === userId);
  if (!user || String(user.Password) !== password || !isTrue_(user.Active)) {
    throw new Error("Incorrect login details or inactive account.");
  }

  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const sh = sheet_(APP.SHEETS.SESSIONS);
  sh.appendRow([token, user.UserID, expires, new Date()]);
  return { token, user: publicUser_(user), expiresAt: expires.toISOString() };
}

function logout_(b) {
  const token = String(b.token || "");
  if (!token) return { loggedOut: true };
  const sh = sheet_(APP.SHEETS.SESSIONS);
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === token) sh.deleteRow(i + 1);
  }
  return { loggedOut: true };
}

function employeeDashboard_(b) {
  const user = auth_(b.token);
  const now = new Date();
  const today = todayKey_();
  const all = attendanceRows_().filter(r => r.UserID === user.UserID);
  const todayRow = all.find(r => r.Date === today) || null;
  const weekStart = weekStartKey_();
  const monthStart = today.slice(0, 8) + "01";
  return {
    user: publicUser_(user),
    now: Utilities.formatDate(now, APP.TZ, "yyyy-MM-dd'T'HH:mm:ss"),
    today: today,
    settings: publicSettings_(),
    workingDays: workingDays_(),
    todayRecord: todayRow ? publicAttendance_(todayRow) : null,
    totals: {
      todayMinutes: sumMinutes_(all, today, today),
      weekMinutes: sumMinutes_(all, weekStart, today),
      monthMinutes: sumMinutes_(all, monthStart, today)
    },
    recent: all.sort((a,b) => b.Date.localeCompare(a.Date)).slice(0, 20).map(publicAttendance_)
  };
}

function punch_(b) {
  const user = auth_(b.token);
  const kind = String(b.kind || "");
  if (kind !== "in" && kind !== "out") throw new Error("Invalid attendance action.");
  const allowOutsideOffice = kind === "out" && b.allowOutsideOffice === true;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date();
    const date = todayKey_();
    const settings = settings_();
    const day = weekdayName_(now);
    const workingDays = workingDays_();
    if (!workingDays[day]) throw new Error("Today is not a working day.");

    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    const accuracy = Number(b.accuracy);
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(accuracy)) {
      throw new Error("Your location could not be verified. Please enable GPS and try again.");
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("The GPS location received is invalid.");
    if (accuracy > Number(settings.MAX_GPS_ACCURACY_METERS || 100)) {
      throw new Error("GPS accuracy is too low. Please move near a window or outdoors and try again.");
    }
    if (settings.OFFICE_LATITUDE === "" || settings.OFFICE_LONGITUDE === "") {
      throw new Error("Office GPS coordinates have not been configured by the admin.");
    }
    const distance = distanceMeters_(lat, lng, Number(settings.OFFICE_LATITUDE), Number(settings.OFFICE_LONGITUDE));
    const radius = Number(settings.GPS_RADIUS_METERS || 100);
    if (kind === "in" && distance > radius) {
      throw new Error("You are not in the office. Attendance cannot be marked from your current location.");
    }
    if (kind === "out" && !allowOutsideOffice && distance > radius) {
      throw new Error("You are not in the office. Normal punch out is not available.");
    }

    const currentTime = Utilities.formatDate(now, APP.TZ, "HH:mm");
    if (kind === "in" && currentTime < String(settings.OFFICE_START || "10:00")) {
      throw new Error("Punch-in is available from " + format12_(settings.OFFICE_START || "10:00") + " onwards.");
    }

    const sh = sheet_(APP.SHEETS.ATTENDANCE);
    const rows = attendanceRows_();
    const existing = rows.find(r => r.UserID === user.UserID && r.Date === date);
    if (kind === "in") {
      if (existing) throw new Error("You have already punched in today.");
      sh.appendRow([date, user.UserID, user.Name, now, "", lat, lng, "", "", "", "PRESENT", now, now, accuracy, "", ""]);
      return { message: "Punch-in successful.", time: format12_(currentTime), distanceMeters: Math.round(distance) };
    }

    if (!existing) throw new Error("You must punch in before punching out.");
    if (existing.PunchOut) throw new Error("You have already punched out today.");
    const rowNum = existing._row;
    const punchInDate = existing.PunchIn instanceof Date ? existing.PunchIn : new Date(existing.PunchIn);
    if (isNaN(punchInDate.getTime())) throw new Error("Your punch-in record needs admin review.");
    const minutes = Math.max(0, Math.round((now.getTime() - punchInDate.getTime()) / 60000));
    const method = allowOutsideOffice ? "OUTSIDE_OFFICE" : "NORMAL_GEOFENCE";
    sh.getRange(rowNum, 5).setValue(now);
    sh.getRange(rowNum, 8).setValue(lat);
    sh.getRange(rowNum, 9).setValue(lng);
    sh.getRange(rowNum, 10).setValue(minutes);
    sh.getRange(rowNum, 11).setValue(allowOutsideOffice ? "COMPLETED_OUTSIDE_OFFICE" : "COMPLETED");
    sh.getRange(rowNum, 13).setValue(now);
    sh.getRange(rowNum, 15).setValue(accuracy);
    sh.getRange(rowNum, 16).setValue(method);
    return {
      message: allowOutsideOffice ? "Outside-office punch-out successful. Your location has been recorded." : "Punch-out successful.",
      time: format12_(currentTime), workedMinutes: minutes, distanceMeters: Math.round(distance), punchOutMethod: method
    };
  } finally {
    lock.releaseLock();
  }
}

/** Run upgradeAttendanceFeatures() once after replacing this Code.gs. */
function upgradeAttendanceFeatures() {
  ensureAttendanceColumns_();
  installDailyAutoPunchOutTrigger_();
  Logger.log("Attendance upgrade complete. Added GPS/method columns and installed the daily 11 PM auto punch-out trigger.");
}

function ensureAttendanceColumns_() {
  const sh = sheet_(APP.SHEETS.ATTENDANCE);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, APP.ATT_HEADERS.length).setValues([APP.ATT_HEADERS]);
    return;
  }
  const current = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  APP.ATT_HEADERS.forEach(header => {
    if (!current.includes(header)) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(header);
    }
  });
  sh.setFrozenRows(1);
}

function installDailyAutoPunchOutTrigger_() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "runDailyAutoPunchOut") ScriptApp.deleteTrigger(trigger);
  });
  // Apps Script time triggers run approximately within a 15-minute window.
  // Scheduling near 11:45 PM ensures the fixed 11:00 PM cutoff has passed.
  ScriptApp.newTrigger("runDailyAutoPunchOut")
    .timeBased().everyDays(1).atHour(23).nearMinute(45).inTimezone(APP.TZ).create();
}

function runDailyAutoPunchOut() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    const today = todayKey_();
    const nowClock = Utilities.formatDate(now, APP.TZ, "HH:mm");
    const sh = sheet_(APP.SHEETS.ATTENDANCE);
    const rows = attendanceRows_();
    let closed = 0;
    rows.forEach(r => {
      if (!r.PunchIn || r.PunchOut || !r.Date || r.Date > today) return;
      if (r.Date === today && nowClock < "23:00") return;
      const cutoff = new Date(r.Date + "T23:00:00+05:45");
      const punchIn = r.PunchIn instanceof Date ? r.PunchIn : new Date(r.PunchIn);
      if (isNaN(cutoff.getTime()) || isNaN(punchIn.getTime())) return;
      const worked = Math.max(0, Math.round((cutoff.getTime() - punchIn.getTime()) / 60000));
      sh.getRange(r._row, 5).setValue(cutoff);
      sh.getRange(r._row, 10).setValue(worked);
      sh.getRange(r._row, 11).setValue("AUTO_PUNCHED_OUT_MISSED");
      sh.getRange(r._row, 13).setValue(now);
      sh.getRange(r._row, 16).setValue("AUTO_MISSED_PUNCH_OUT");
      closed++;
    });
    Logger.log("Auto punch-out completed. Records closed: " + closed);
    return closed;
  } finally {
    lock.releaseLock();
  }
}

function adminDashboard_(b) {
  auth_(b.token, "admin");
  const users = getRows_(APP.SHEETS.USERS).map(publicUser_);
  const records = attendanceRows_().sort((a,b) => (b.Date + String(b.PunchIn)).localeCompare(a.Date + String(a.PunchIn)));
  const today = todayKey_();
  const weekStart = weekStartKey_();
  const monthStart = today.slice(0, 8) + "01";
  const settings = publicSettings_();
  const days = workingDays_();
  const todayRecords = records.filter(r => r.Date === today);
  const activeEmployees = users.filter(u => u.Role === "employee" && u.Active);
  const presentIds = new Set(todayRecords.map(r => r.UserID));
  const nowMins = Number(Utilities.formatDate(new Date(), APP.TZ, "HHmm"));
  const closeMins = Number(String(settings.OFFICE_END || "18:00").replace(":", ""));
  const isWorkday = !!days[weekdayName_(new Date())];
  const absent = isWorkday && nowMins >= closeMins ? activeEmployees.filter(u => !presentIds.has(u.UserID)) : [];

  const employeeStats = activeEmployees.map(u => {
    const mine = records.filter(r => r.UserID === u.UserID);
    const tr = mine.find(r => r.Date === today);
    return {
      user: u,
      todayMinutes: sumMinutes_(mine, today, today),
      weekMinutes: sumMinutes_(mine, weekStart, today),
      monthMinutes: sumMinutes_(mine, monthStart, today),
      todayStatus: !tr ? (absent.some(x => x.UserID === u.UserID) ? "ABSENT" : "NOT PUNCHED IN") : (String(tr.Status).indexOf("AUTO_PUNCHED_OUT") === 0 ? "AUTO PUNCHED OUT" : (String(tr.Status).indexOf("OUTSIDE_OFFICE") >= 0 ? "PUNCHED OUTSIDE" : (tr.PunchOut ? "PUNCHED OUT" : "WORKING"))),
      todayRecord: tr ? publicAttendance_(tr) : null
    };
  });

  return {
    today, now: Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss"),
    counts: {
      employees: activeEmployees.length,
      present: todayRecords.length,
      working: todayRecords.filter(r => !r.PunchOut).length,
      absent: absent.length
    },
    settings, workingDays: days, users,
    employeeStats,
    records: records.slice(0, 300).map(publicAttendance_)
  };
}

function saveSettings_(b) {
  auth_(b.token, "admin");
  const incoming = b.settings || {};
  const allowed = ["OFFICE_NAME", "OFFICE_LATITUDE", "OFFICE_LONGITUDE", "GPS_RADIUS_METERS", "OFFICE_START", "OFFICE_END", "MAX_GPS_ACCURACY_METERS"];
  const values = {};
  allowed.forEach(k => { if (incoming[k] !== undefined) values[k] = String(incoming[k]).trim(); });
  if (values.GPS_RADIUS_METERS !== undefined && (!isFinite(Number(values.GPS_RADIUS_METERS)) || Number(values.GPS_RADIUS_METERS) < 1 || Number(values.GPS_RADIUS_METERS) > 10000)) throw new Error("GPS radius must be between 1 and 10,000 metres.");
  if (values.MAX_GPS_ACCURACY_METERS !== undefined && (!isFinite(Number(values.MAX_GPS_ACCURACY_METERS)) || Number(values.MAX_GPS_ACCURACY_METERS) < 1)) throw new Error("GPS accuracy limit must be a positive number.");
  ["OFFICE_START", "OFFICE_END"].forEach(k => {
    if (values[k] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values[k])) throw new Error(k + " must use 24-hour HH:MM format, for example 10:00.");
  });
  if ((values.OFFICE_LATITUDE !== undefined && values.OFFICE_LATITUDE !== "") && (!isFinite(Number(values.OFFICE_LATITUDE)) || Math.abs(Number(values.OFFICE_LATITUDE)) > 90)) throw new Error("Invalid office latitude.");
  if ((values.OFFICE_LONGITUDE !== undefined && values.OFFICE_LONGITUDE !== "") && (!isFinite(Number(values.OFFICE_LONGITUDE)) || Math.abs(Number(values.OFFICE_LONGITUDE)) > 180)) throw new Error("Invalid office longitude.");

  const sh = sheet_(APP.SHEETS.SETTINGS);
  // Update EVERY matching key, not just the first one. Older versions could
  // leave duplicate OFFICE_START/OFFICE_END rows behind; settings_() reads the
  // whole sheet, so a later duplicate could override the newly saved value.
  const data = sh.getDataRange().getValues();
  Object.keys(values).forEach(k => {
    const matchingRows = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === k) matchingRows.push(i + 1);
    }
    if (matchingRows.length) {
      matchingRows.forEach(rowNum => {
        const cell = sh.getRange(rowNum, 2);
        if (k === "OFFICE_START" || k === "OFFICE_END") cell.setNumberFormat("@");
        cell.setValue(values[k]);
      });
    } else {
      const rowNum = sh.getLastRow() + 1;
      sh.getRange(rowNum, 1).setValue(k);
      const cell = sh.getRange(rowNum, 2);
      if (k === "OFFICE_START" || k === "OFFICE_END") cell.setNumberFormat("@");
      cell.setValue(values[k]);
    }
  });

  const days = b.workingDays;
  if (days && typeof days === "object") {
    const daySh = sheet_(APP.SHEETS.DAYS);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    daySh.clearContents();
    daySh.getRange(1, 1, 1, 2).setValues([["Day", "Working"]]);
    daySh.getRange(2, 1, 7, 2).setValues(dayNames.map(d => [d, !!days[d]]));
  }
  return { message: "Office settings saved.", settings: publicSettings_(), workingDays: workingDays_() };
}

function saveUser_(b) {
  auth_(b.token, "admin");
  const data = b.user || {};
  const userId = clean_(data.UserID).toLowerCase();
  const name = clean_(data.Name);
  const role = String(data.Role || "employee").toLowerCase();
  const password = String(data.Password || "");
  if (!/^[a-z0-9._-]{3,40}$/.test(userId)) throw new Error("User ID must be 3–40 characters and use letters, numbers, dots, underscores or hyphens.");
  if (!name) throw new Error("Enter the employee name.");
  if (role !== "admin" && role !== "employee") throw new Error("Role must be admin or employee.");

  const sh = sheet_(APP.SHEETS.USERS);
  const rows = getRows_(APP.SHEETS.USERS);
  const existing = rows.find(u => String(u.UserID).toLowerCase() === userId);
  if (!existing && password.length < 6) throw new Error("New users need a password of at least 6 characters.");
  if (existing) {
    const row = existing._row;
    sh.getRange(row, 2).setValue(name);
    if (password) sh.getRange(row, 3).setValue(password);
    sh.getRange(row, 4).setValue(role);
    sh.getRange(row, 5).setValue(data.Active === undefined ? true : !!data.Active);
  } else {
    sh.appendRow([userId, name, password, role, data.Active === undefined ? true : !!data.Active, new Date()]);
  }
  return { message: existing ? "User updated." : "User created." };
}

function toggleUser_(b) {
  auth_(b.token, "admin");
  const userId = clean_(b.userId).toLowerCase();
  const sh = sheet_(APP.SHEETS.USERS);
  const rows = getRows_(APP.SHEETS.USERS);
  const target = rows.find(u => String(u.UserID).toLowerCase() === userId);
  if (!target) throw new Error("User not found.");
  sh.getRange(target._row,  5).setValue(!!b.active);
  return { message: "User status updated." };
}

function auth_(token, requiredRole) {
  token = String(token || "");
  if (!token) throw new Error("Your session has expired. Please log in again.");
  const sessions = getRows_(APP.SHEETS.SESSIONS);
  const session = sessions.find(s => String(s.Token) === token);
  if (!session || new Date(session.ExpiresAt).getTime() < Date.now()) throw new Error("Your session has expired. Please log in again.");
  const users = getRows_(APP.SHEETS.USERS);
  const user = users.find(u => String(u.UserID) === String(session.UserID));
  if (!user || !isTrue_(user.Active)) throw new Error("Your account is inactive.");
  if (requiredRole && String(user.Role).toLowerCase() !== requiredRole) throw new Error("You do not have permission to do this.");
  return user;
}

function publicUser_(u) {
  return { UserID: String(u.UserID || ""), Name: String(u.Name || ""), Role: String(u.Role || "employee").toLowerCase(), Active: isTrue_(u.Active) };
}
function publicAttendance_(r) {
  let liveMinutes = Number(r.WorkedMinutes || 0);
  if (!liveMinutes && r.PunchIn && !r.PunchOut && r.Date === todayKey_()) {
    const start = r.PunchIn instanceof Date ? r.PunchIn : new Date(r.PunchIn);
    if (!isNaN(start.getTime())) liveMinutes = Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
  }
  return {
    Date: r.Date,
    UserID: r.UserID,
    Name: r.Name,
    PunchIn: dateValue_(r.PunchIn),
    PunchOut: dateValue_(r.PunchOut),
    InLatitude: r.InLatitude || "",
    InLongitude: r.InLongitude || "",
    OutLatitude: r.OutLatitude || "",
    OutLongitude: r.OutLongitude || "",
    InAccuracyMeters: r.InAccuracyMeters || "",
    OutAccuracyMeters: r.OutAccuracyMeters || "",
    PunchOutMethod: r.PunchOutMethod || "",
    WorkedMinutes: liveMinutes || Number(r.PunchIn && r.PunchOut ? Math.max(0, Math.round((new Date(r.PunchOut)-new Date(r.PunchIn))/60000)) : 0),
    Status: r.Status || (r.PunchOut ? "COMPLETED" : "PRESENT")
  };
}
function dateValue_(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, APP.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}
function attendanceRows_() {
  return getRows_(APP.SHEETS.ATTENDANCE).map(r => {
    r.Date = normalizeDate_(r.Date);
    return r;
  });
}
function normalizeDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, "yyyy-MM-dd");
  return String(v || "").slice(0, 10);
}
function sumMinutes_(rows, start, end) {
  return rows.filter(r => r.Date >= start && r.Date <= end).reduce((s, r) => {
    let m = Number(r.WorkedMinutes || 0);
    if (!m && r.PunchIn && r.PunchOut) m = Math.max(0, Math.round((new Date(r.PunchOut)-new Date(r.PunchIn))/60000));
    if (!r.PunchOut && r.PunchIn && r.Date === todayKey_()) {
      const start = r.PunchIn instanceof Date ? r.PunchIn : new Date(r.PunchIn);
      if (!isNaN(start.getTime())) m = Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
    }
    return s + m;
  }, 0);
}
function settings_() {
  const sh = sheet_(APP.SHEETS.SETTINGS);
  const out = Object.assign({}, APP.DEFAULT_SETTINGS);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues().forEach(r => {
      if (r[0]) {
        const key = String(r[0]).trim();
        const normalized = normalizeSettingValue_(key, r[1]);
        // An empty duplicate row must not erase a valid value read earlier.
        if (normalized !== "") out[key] = normalized;
      }
    });
  }
  return out;
}
function normalizeSettingValue_(key, value) {
  if (value === null || value === undefined || value === "") return "";
  if (key !== "OFFICE_START" && key !== "OFFICE_END") return String(value);

  // Google Sheets may turn a time string into a Date object. Convert it back
  // to a stable 24-hour HH:mm string before sending it to either dashboard.
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP.TZ, "HH:mm");
  }
  if (typeof value === "number" && isFinite(value)) {
    const total = ((Math.round((value % 1) * 1440) % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  const text = String(value).trim();
  let m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    if (m[3]) {
      const ap = m[3].toUpperCase();
      if (hour < 1 || hour > 12 || minute > 59) return text;
      hour = (hour % 12) + (ap === "PM" ? 12 : 0);
    }
    if (hour > 23 || minute > 59) return text;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  // Recover legacy values serialized as a date string by Sheets/Apps Script.
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, APP.TZ, "HH:mm");
  return text;
}
function publicSettings_() { return settings_(); }
function workingDays_() {
  const sh = sheet_(APP.SHEETS.DAYS);
  const out = {Sunday:true, Monday:true, Tuesday:true, Wednesday:true, Thursday:true, Friday:true, Saturday:false};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues().forEach(r => { if (r[0]) out[String(r[0])] = isTrue_(r[1]); });
  return out;
}
function getRows_(name) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  const vals = sh.getDataRange().getValues();
  const headers = vals[0].map(String);
  return vals.slice(1).map((row, i) => {
    const o = {_row:i+2};
    headers.forEach((h, j) => o[h] = row[j]);
    return o;
  }).filter(o => Object.keys(o).some(k => k !== "_row" && o[k] !== ""));
}
function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("Missing sheet " + name + ". Run setupDatabase() first.");
  return sh;
}
function todayKey_() { return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd"); }
function weekStartKey_() {
  const now = new Date();
  const day = Number(Utilities.formatDate(now, APP.TZ, "u")); // Monday=1...Sunday=7
  const daysSinceSunday = day === 7 ? 0 : day;
  const d = new Date(now.getTime() - daysSinceSunday * 86400000);
  return Utilities.formatDate(d, APP.TZ, "yyyy-MM-dd");
}
function weekdayName_(date) { return Utilities.formatDate(date, APP.TZ, "EEEE"); }
function format12_(hhmm) {
  const p = String(hhmm || "00:00").split(":");
  let h = Number(p[0]), m = p[1] || "00";
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + m + " " + ap;
}
function distanceMeters_(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function clean_(v) { return String(v == null ? "" : v).trim(); }
function isTrue_(v) { return v === true || String(v).toLowerCase() === "true" || String(v) === "1" || String(v).toLowerCase() === "yes"; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
