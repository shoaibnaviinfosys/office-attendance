const API = "/api";
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem("attendance_token") || "";
let currentUser = null;
let employeeData = null;
let adminData = null;
let clockTimer = null;

async function api(action, payload = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, ...payload })
  });
  let result;
  try { result = await res.json(); } catch (_) { throw new Error("The server returned an unreadable response. Check the deployment settings."); }
  if (!result.ok) {
    if ((result.error || "").toLowerCase().includes("session has expired")) logout(false);
    throw new Error(result.error || "Something went wrong.");
  }
  return result.data;
}
function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }
function toast(message) { $("globalToast").textContent = message; show("globalToast"); setTimeout(() => hide("globalToast"), 3500); }
function fmtTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? String(value) : new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kathmandu",hour:"numeric",minute:"2-digit",hour12:true}).format(d);
}
function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T12:00:00+05:45");
  return new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kathmandu",day:"2-digit",month:"short",year:"numeric"}).format(d);
}
function duration(minutes) {
  minutes = Number(minutes || 0);
  return Math.floor(minutes/60) + "h " + (minutes%60) + "m";
}
function updateClock() {
  const now = new Date();
  const t = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kathmandu",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true}).format(now);
  const d = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kathmandu",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now);
  if ($("liveClock")) $("liveClock").textContent = t;
  if ($("clockDate")) $("clockDate").textContent = d;
  if ($("punchClock")) $("punchClock").textContent = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kathmandu",hour:"numeric",minute:"2-digit",hour12:true}).format(now);
  if (employeeData) updatePunchAvailability();
}
function showLogin() {
  hide("employeeView"); hide("adminView"); hide("topUser"); show("loginView");
  currentUser = null; employeeData = null; adminData = null;
}
function logout(callServer = true) {
  const oldToken = token;
  token = ""; sessionStorage.removeItem("attendance_token");
  if (callServer && oldToken) api("logout", {token:oldToken}).catch(()=>{});
  showLogin();
}
async function login(userId, password) {
  const data = await api("login", {userId, password});
  token = data.token; sessionStorage.setItem("attendance_token", token);
  currentUser = data.user;
  $("topUserName").textContent = currentUser.Name + " · " + currentUser.Role;
  hide("loginView"); show("topUser"); 
  if (currentUser.Role === "admin") { show("adminView"); await loadAdmin(); }
  else { show("employeeView"); await loadEmployee(); }
}
async function loadEmployee() {
  employeeData = await api("employeeDashboard");
  $("employeeName").textContent = employeeData.user.Name;
  $("employeeDate").textContent = fmtDate(employeeData.today);
  $("todayHours").textContent = duration(employeeData.totals.todayMinutes);
  $("weekHours").textContent = duration(employeeData.totals.weekMinutes);
  $("monthHours").textContent = duration(employeeData.totals.monthMinutes);
  const r = employeeData.todayRecord;
  hide("punchOutsideBtn"); hide("outsidePunchHint");
  $("punchInTime").textContent = r ? fmtTime(r.PunchIn) : "—";
  $("punchOutTime").textContent = r ? fmtTime(r.PunchOut) : "—";
  const autoClosed = r && r.PunchOutMethod === "AUTO_MISSED_PUNCH_OUT";
  const outsideClosed = r && r.PunchOutMethod === "OUTSIDE_OFFICE";
  $("attendanceStatus").textContent = !r ? "Not punched in" : autoClosed ? "Auto punch-out · missed" : outsideClosed ? "Punched out outside office" : r.PunchOut ? "Completed" : "Currently working";
  $("attendanceStatus").className = "pill " + (r ? (autoClosed ? "amber" : "green") : "");
  $("employeeHistory").innerHTML = employeeData.recent.map(x => `<tr><td>${fmtDate(x.Date)}</td><td>${fmtTime(x.PunchIn)}</td><td>${fmtTime(x.PunchOut)}${x.PunchOutMethod === "AUTO_MISSED_PUNCH_OUT" ? '<br><span class="status-tag warning">Auto · missed</span>' : x.PunchOutMethod === "OUTSIDE_OFFICE" ? '<br><span class="status-tag">Outside office</span>' : ""}</td><td>${duration(x.WorkedMinutes)}</td></tr>`).join("") || `<tr><td colspan="4">No attendance records yet.</td></tr>`;
  updatePunchAvailability();
}
function normalizeOfficeTime(value, fallback = "10:00") {
  const raw = String(value ?? "").trim();
  let m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return fallback;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (m[3]) {
    const ap = m[3].toUpperCase();
    if (hour < 1 || hour > 12) return fallback;
    hour = (hour % 12) + (ap === "PM" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return fallback;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}
function kathmanduMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = Number(parts.find(p => p.type === "hour").value);
  const minute = Number(parts.find(p => p.type === "minute").value);
  return hour * 60 + minute;
}
function updatePunchAvailability() {
  if (!employeeData || currentUser?.Role === "admin") return;
  const settings = employeeData.settings || {};
  const record = employeeData.todayRecord;
  const start = normalizeOfficeTime(settings.OFFICE_START, "10:00");
  const [startHour, startMinute] = start.split(":").map(Number);
  const openingMinutes = startHour * 60 + startMinute;
  const currentMinutes = kathmanduMinutesNow();
  const isWorkingDay = new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Kathmandu", weekday:"long"}).format(new Date());
  const workdays = employeeData.workingDays || null;
  const isWorkday = !workdays || workdays[isWorkingDay] !== false;
  const btn = $("punchBtn");
  $("countdown").textContent = "";
  if (!isWorkday) {
    btn.disabled = true; btn.textContent = "Office closed today";
    $("punchHint").textContent = "Today is a non-working day.";
    return;
  }
  if (!record) {
    if (currentMinutes < openingMinutes) {
      btn.disabled = true; btn.textContent = "Punch in";
      $("punchHint").textContent = "Punch-in opens at " + displayHHMM(start) + ".";
      $("countdown").textContent = "Punch-in available in " + countdownTo(start);
    } else {
      btn.disabled = false; btn.textContent = "Punch in";
      $("punchHint").textContent = "You are within the attendance window.";
      $("countdown").textContent = "Punch-in is available now.";
    }
  } else if (!record.PunchOut) {
    btn.disabled = false; btn.textContent = "Punch out";
    $("punchHint").textContent = "You can punch out whenever you finish work. GPS is checked when you punch out.";
    $("countdown").textContent = "You have already punched in today.";
  } else {
    btn.disabled = true; btn.textContent = "Attendance completed";
    $("punchHint").textContent = "Your attendance for today is complete.";
    $("countdown").textContent = "Today's attendance is complete.";
  }
}
function displayHHMM(v) {
  const [hh,mm] = normalizeOfficeTime(v).split(":").map(Number);
  const ap = hh >= 12 ? "PM" : "AM";
  return (hh % 12 || 12) + ":" + String(mm).padStart(2,"0") + " " + ap;
}
function countdownTo(hhmm) {
  const [h, m] = normalizeOfficeTime(hhmm).split(":").map(Number);
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = type => Number(parts.find(p => p.type === type).value);
  const year = part("year"), month = part("month"), day = part("day");
  const targetMs = Date.UTC(year, month - 1, day, h, m) - (5 * 60 + 45) * 60000;
  let seconds = Math.max(0, Math.floor((targetMs - now.getTime()) / 1000));
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"} (${hours}h ${minutes}m ${remainingSeconds}s)`;
}
async function getLocation() {
  if (!navigator.geolocation) throw new Error("This browser does not support GPS location.");
  return new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(
    p => resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
    e => reject(new Error(e.code === 1 ? "Location permission was denied. Allow location access in your browser settings." : "Unable to get your GPS location. Please try again.")),
    {enableHighAccuracy:true,timeout:20000,maximumAge:0}
  ));
}
async function punch() {
  const btn = $("punchBtn"); const kind = employeeData.todayRecord ? "out" : "in";
  btn.disabled = true; btn.textContent = "Checking GPS…";
  try {
    const gps = await getLocation();
    const result = await api("punch", {kind,...gps});
    $("punchMessage").className = "notice success"; $("punchMessage").textContent = result.message + " · " + result.time; show("punchMessage");
    await loadEmployee();
  } catch(e) {
    $("punchMessage").className = "notice error"; $("punchMessage").textContent = e.message; show("punchMessage");
    updatePunchAvailability();
    if (kind === "out" && e.message.includes("Normal punch out is not available")) {
      show("punchOutsideBtn"); show("outsidePunchHint");
    }
  }
}
async function punchOutsideOffice() {
  const btn = $("punchOutsideBtn");
  btn.disabled = true; btn.textContent = "Checking GPS…";
  try {
    const gps = await getLocation();
    const result = await api("punch", {kind:"out", allowOutsideOffice:true, ...gps});
    $("punchMessage").className = "notice success";
    $("punchMessage").textContent = result.message + " · " + result.time;
    show("punchMessage");
    hide("punchOutsideBtn"); hide("outsidePunchHint");
    await loadEmployee();
  } catch(e) {
    $("punchMessage").className = "notice error";
    $("punchMessage").textContent = e.message;
    show("punchMessage");
    btn.disabled = false; btn.textContent = "Punch out outside office";
  }
}
async function loadAdmin() {
  adminData = await api("adminDashboard");
  $("adminDate").textContent = fmtDate(adminData.today) + " · Kathmandu time";
  $("countEmployees").textContent = adminData.counts.employees;
  $("countPresent").textContent = adminData.counts.present;
  $("countWorking").textContent = adminData.counts.working;
  $("countAbsent").textContent = adminData.counts.absent;
  $("employeeStats").innerHTML = adminData.employeeStats.map(x => `<tr><td><strong>${esc(x.user.Name)}</strong><br><span class="muted">${esc(x.user.UserID)}</span></td><td>${duration(x.todayMinutes)}</td><td>${duration(x.weekMinutes)}</td><td>${duration(x.monthMinutes)}</td><td><span class="status-text ${x.todayStatus==="ABSENT"?"bad":x.todayStatus==="WORKING"?"good":""}">${x.todayStatus}</span></td></tr>`).join("") || `<tr><td colspan="5">No employees added yet.</td></tr>`;
  $("usersTable").innerHTML = adminData.users.map(u => `<tr><td>${esc(u.UserID)}</td><td>${esc(u.Name)}</td><td>${esc(u.Role)}</td><td>${u.Active?"Active":"Inactive"}</td><td><button class="btn btn-secondary btn-small" data-toggle="${esc(u.UserID)}" data-active="${!u.Active}">${u.Active?"Deactivate":"Activate"}</button> <button class="btn btn-ghost btn-small" data-edit="${esc(u.UserID)}">Edit</button></td></tr>`).join("");
  $("recordsTable").innerHTML = renderRecords(adminData.records);
  fillSettings(adminData.settings, adminData.workingDays);
}
function renderRecords(records) {
  return records.map(r => {
    const method = r.PunchOutMethod === "AUTO_MISSED_PUNCH_OUT" ? '<span class="status-tag warning">Auto · missed</span>' : r.PunchOutMethod === "OUTSIDE_OFFICE" ? '<span class="status-tag">Outside office</span>' : r.PunchOut ? '<span class="status-tag good">Normal GPS</span>' : "—";
    return `<tr data-record-search="${esc((r.Date+" "+r.Name+" "+r.UserID).toLowerCase())}"><td>${fmtDate(r.Date)}</td><td>${esc(r.Name)}<br><span class="muted">${esc(r.UserID)}</span></td><td>${fmtTime(r.PunchIn)}</td><td>${fmtTime(r.PunchOut)}</td><td>${duration(r.WorkedMinutes)}</td><td>${coord(r.InLatitude,r.InLongitude)}</td><td>${coord(r.OutLatitude,r.OutLongitude)}</td><td>${method}</td></tr>`;
  }).join("") || `<tr><td colspan="8">No attendance records yet.</td></tr>`;
}
function coord(a,b) { return a!=="" && b!=="" ? `<a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(a+","+b)}">${Number(a).toFixed(5)}, ${Number(b).toFixed(5)}</a>` : "—"; }
function esc(s) { return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fillSettings(s, days) {
  $("sOfficeName").value=s.OFFICE_NAME||"";
  $("sOfficeStart").value=s.OFFICE_START||"10:00";
  $("sOfficeEnd").value=s.OFFICE_END||"18:00";
  $("sRadius").value=s.GPS_RADIUS_METERS||100;
  $("sLat").value=s.OFFICE_LATITUDE||"";
  $("sLng").value=s.OFFICE_LONGITUDE||"";
  $("sAccuracy").value=s.MAX_GPS_ACCURACY_METERS||100;
  $("workingDays").innerHTML=Object.keys(days).map(d=>`<label><input type="checkbox" data-day="${d}" ${days[d]?"checked":""}>${d.slice(0,3)}</label>`).join("");
}
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("hidden",p.id!=="tab-"+tab));
}
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); hide("loginError");
  try { await login($("userId").value.trim(),$("password").value); $("password").value=""; }
  catch(err) { $("loginError").textContent=err.message; show("loginError"); }
});
$("logoutBtn").addEventListener("click",()=>logout(true));
$("punchBtn").addEventListener("click",punch);
$("punchOutsideBtn").addEventListener("click",punchOutsideOffice);
$("refreshAdmin").addEventListener("click",()=>loadAdmin().then(()=>toast("Dashboard refreshed.")).catch(e=>toast(e.message)));
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
$("userForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try {
    await api("saveUser",{user:{UserID:$("newUserId").value,Name:$("newUserName").value,Password:$("newUserPassword").value,Role:$("newUserRole").value}});
    $("userForm").reset(); $("newUserId").readOnly=false; await loadAdmin(); toast("User saved successfully.");
  } catch(err){toast(err.message);}
});
$("clearUserForm").addEventListener("click",()=>{$("userForm").reset(); $("newUserId").readOnly=false;});
$("usersTable").addEventListener("click",async e=>{
  const toggle=e.target.closest("[data-toggle]"), edit=e.target.closest("[data-edit]");
  if(toggle){try{await api("toggleUser",{userId:toggle.dataset.toggle,active:toggle.dataset.active==="true"});await loadAdmin();toast("Account status updated.");}catch(err){toast(err.message);}}
  if(edit){const u=adminData.users.find(x=>x.UserID===edit.dataset.edit);if(u){$("newUserId").value=u.UserID;$("newUserName").value=u.Name;$("newUserRole").value=u.Role;$("newUserPassword").value="";$("newUserId").readOnly=true;switchTab("employees");}}
});
$("settingsForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const workingDays={};document.querySelectorAll("[data-day]").forEach(c=>workingDays[c.dataset.day]=c.checked);
  const settings={OFFICE_NAME:$("sOfficeName").value,OFFICE_START:$("sOfficeStart").value,OFFICE_END:$("sOfficeEnd").value,GPS_RADIUS_METERS:$("sRadius").value,OFFICE_LATITUDE:$("sLat").value,OFFICE_LONGITUDE:$("sLng").value,MAX_GPS_ACCURACY_METERS:$("sAccuracy").value};
  try{await api("saveSettings",{settings,workingDays});await loadAdmin();toast("Office settings saved.");}catch(err){toast(err.message);}
});
$("recordSearch").addEventListener("input",e=>{
  const q=e.target.value.toLowerCase();
  document.querySelectorAll("#recordsTable tr").forEach(tr=>tr.classList.toggle("hidden",!tr.dataset.recordSearch?.includes(q)));
});
(async function init(){
  clockTimer = setInterval(updateClock, 1000);
  updateClock();
  // Require credentials whenever the site is opened or refreshed. This avoids
  // silently restoring a previous browser-tab session and confusing it with a new login.
  token = "";
  sessionStorage.removeItem("attendance_token");
  showLogin();
})();
