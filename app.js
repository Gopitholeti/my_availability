import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { estimate, hours, money, restWarnings, shiftTimes } from "./pay.mjs?v=20261118-3";

const $ = (id) => document.getElementById(id);
let client;
let user = null;
let entries = new Map();
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let requestId = 0;
let saving = false;
let ready = false;
let warningsForWeek = new Map();

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose valid dates.");
  const [year, monthNumber, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, monthNumber - 1, day);
  date.setHours(12, 0, 0, 0);
  if (dateKey(date) !== value) throw new Error("Choose valid dates.");
  return date;
}

function datesBetween(start, end) {
  const date = parseDate(start);
  const last = parseDate(end);
  if (date > last) throw new Error("The end date must be on or after the start date.");
  const dates = [];
  while (date <= last) {
    dates.push(dateKey(date));
    if (dates.length > 366) throw new Error("Select at most 366 days at once.");
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

function message(text) {
  $("message").textContent = text;
}

function populateTimeDropdowns() {
  for (const [id, limit] of [["start-hour", 24], ["end-hour", 24], ["start-minute", 60], ["end-minute", 60]]) {
    const select = $(id);
    for (let value = 0; value < limit; value++) {
      const option = document.createElement("option");
      option.value = String(value).padStart(2, "0");
      option.textContent = option.value;
      select.append(option);
    }
  }
}

populateTimeDropdowns();

function setTime(prefix, value) {
  const [hour = "", minute = ""] = value?.slice(0, 5).split(":") ?? [];
  $(`${prefix}-hour`).value = hour;
  $(`${prefix}-minute`).value = minute;
}

function readTime(prefix) {
  const hour = $(`${prefix}-hour`).value;
  const minute = $(`${prefix}-minute`).value;
  if (!hour && !minute) return null;
  if (!hour || !minute) throw new Error("Choose both the hour and minute, or leave both times blank.");
  return `${hour}:${minute}`;
}

function totalsFor(list) {
  let minutes = 0, cents = 0, unpriced = 0, untimed = 0;
  for (const entry of list) {
    if (!entry.shift) {
      if (entry.status === "busy") untimed++;
      continue;
    }
    if (!entry.start_time && !entry.end_time) {
      untimed++;
      continue;
    }
    const pay = estimate(entry);
    minutes += pay.minutes;
    cents += pay.cents;
    unpriced += pay.unpriced;
  }
  return { minutes, cents, unpriced, untimed };
}

function weekStart(value) {
  const date = parseDate(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function appendWeekTotal(startDate) {
  const monday = weekStart(startDate);
  const mondayKey = dateKey(monday);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sundayKey = dateKey(sunday);
  const list = [...entries.values()].filter((entry) => entry.date >= mondayKey && entry.date <= sundayKey);
  const total = totalsFor(list);
  const warningCount = list.filter((entry) => entry.shift && warningsForWeek.has(entry.date)).length;
  const cell = document.createElement("div");
  cell.className = "week-total";
  cell.setAttribute("aria-label", `Week ending ${sunday.toLocaleDateString(undefined, { dateStyle: "medium" })}`);
  const amount = document.createElement("strong");
  amount.textContent = total.minutes ? `${hours(total.minutes)} · ${money(total.cents)}` : "No timed shifts";
  const detail = document.createElement("small");
  detail.textContent = [
    total.untimed ? `${total.untimed} without times` : "",
    total.unpriced ? `${hours(total.unpriced)} unpriced` : "",
    warningCount ? `${warningCount} to review` : "",
  ].filter(Boolean).join(" · ");
  cell.append(amount);
  if (detail.textContent) cell.append(detail);
  $("calendar").append(cell);
}

function handle(action) {
  return async (event) => {
    event?.preventDefault();
    try {
      await action(event);
    } catch (error) {
      message(error instanceof Error ? error.message : String(error));
    }
  };
}

function render() {
  $("month").textContent = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("calendar").replaceChildren();
  const offset = (month.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) $("calendar").append(document.createElement("span"));
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  warningsForWeek = restWarnings([...entries.values()]);
  let weekColumn = offset;
  let weekDate = new Date(month.getFullYear(), month.getMonth(), 1);
  weekDate.setDate(weekDate.getDate() - offset);
  for (let day = 1; day <= count; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = dateKey(date);
    const entry = entries.get(key);
    const pay = entry?.shift && entry.start_time && entry.end_time ? estimate(entry) : null;
    const timeLabel = pay ? `${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}` : "";
    const status = !ready ? "loading" : entry?.shift ? entry.shift.toLowerCase() : entry?.status === "busy" ? "busy" : "free";
    const label = !ready ? "Loading" : entry?.shift === "AM" ? "☀️ AM" : entry?.shift === "PM" ? "🌙 PM" : status === "busy" ? "Busy" : "Free";
    const button = document.createElement("button");
    button.className = `day ${status}${key === dateKey(new Date()) ? " today" : ""}`;
    button.disabled = !ready;
    button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { dateStyle: "full" })}: ${label}${entry?.site ? `, ${entry.site}` : ""}${status === "busy" ? ", assign shift and site" : ""}${pay ? `, ${timeLabel}, ${hours(pay.minutes)} paid` : ""}${warningsForWeek.has(key) ? `. ${warningsForWeek.get(key)}` : ""}${entry?.note ? `. ${entry.note}` : ""}`);
    if (key === dateKey(new Date())) button.setAttribute("aria-current", "date");
    const number = document.createElement("strong");
    number.textContent = String(day);
    const state = document.createElement("span");
    state.className = "day-status";
    state.textContent = label;
    button.append(number, state);
    if (entry?.site) {
      const site = document.createElement("span");
      site.className = "day-site";
      site.textContent = entry.site;
      button.append(site);
    }
    if (pay) {
      const time = document.createElement("span");
      time.className = "day-time";
      time.textContent = `${timeLabel}${warningsForWeek.has(key) ? " ⚠️" : ""}`;
      button.append(time);
    }
    if (entry?.note) {
      const note = document.createElement("span");
      note.className = "day-note";
      note.textContent = entry.note;
      button.append(note);
    }
    button.addEventListener("click", () => openEditor(key));
    $("calendar").append(button);
    weekColumn++;
    if (weekColumn === 7) {
      appendWeekTotal(dateKey(weekDate));
      weekColumn = 0;
      weekDate.setDate(weekDate.getDate() + 7);
    }
  }
  if (weekColumn > 0) appendWeekTotal(dateKey(weekDate));
  $("range").disabled = !ready;
  $("export").disabled = !ready;
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-`;
  const monthTotal = totalsFor([...entries.values()].filter((entry) => entry.date.startsWith(monthPrefix)));
  $("pay-summary").textContent = !ready ? "" : `${hours(monthTotal.minutes)} · ${money(monthTotal.cents)}${monthTotal.untimed ? ` · ${monthTotal.untimed} without times` : ""}${monthTotal.unpriced ? ` · ${hours(monthTotal.unpriced)} unpriced` : ""}`;
}

async function load() {
  if (!user) return;
  const currentUser = user.id;
  const id = ++requestId;
  const rows = [];
  let after = null;
  while (true) {
    let query = client.from("availability").select("date,status,note,shift,site,start_time,end_time,start_holiday,end_holiday")
      .eq("user_id", currentUser).order("date").limit(500);
    if (after) query = query.gt("date", after);
    const { data, error } = await query;
    if (id !== requestId || user?.id !== currentUser) return;
    if (error) throw new Error(`Could not load availability: ${error.message}.${error.code === "42703" ? " Run the required database migrations before using this version." : ""}`);
    rows.push(...data);
    if (data.length === 0) break;
    after = data[data.length - 1].date;
  }
  entries = new Map(rows.map((entry) => [entry.date, entry]));
  ready = true;
  render();
}

async function setSession(session) {
  requestId++;
  user = session?.user ?? null;
  entries.clear();
  ready = false;
  $("login").hidden = !!user;
  $("app").hidden = !user;
  $("sign-out").hidden = !user;
  $("account").textContent = user?.email ?? "";
  $("password").value = "";
  if ($("editor").open) $("editor").close();
  render();
  if (user) {
    message("Loading your availability…");
    await load();
    message("");
  }
}

function openEditor(key, range = false) {
  const entry = range ? null : entries.get(key);
  $("start").value = key;
  $("end").value = key;
  $("shift").value = entry?.shift ?? "";
  $("site").value = entry?.site ?? "";
  setTime("start", entry?.start_time);
  setTime("end", entry?.end_time);
  $("start-holiday").checked = !!entry?.start_holiday;
  $("end-holiday").checked = !!entry?.end_holiday;
  $("note").value = entry?.note ?? "";
  $("edit-error").textContent = "";
  $("editor").showModal();
  previewPay();
}

function getTiming() {
  const start_time = readTime("start");
  const end_time = readTime("end");
  if (!!start_time !== !!end_time) throw new Error("Choose both start and end times, or leave both blank.");
  const times = start_time ? shiftTimes({ start_time, end_time }) : null;
  const single = $("start").value === $("end").value;
  return {
    start_time, end_time,
    start_holiday: !!(single && times && $("start-holiday").checked),
    end_holiday: !!(single && times && times.end > 1440 && $("end-holiday").checked),
  };
}

function previewPay() {
  const preview = $("pay-preview");
  preview.replaceChildren();
  preview.hidden = true;
  $("start-holiday-label").hidden = true;
  $("end-holiday-label").hidden = true;
  const anyTime = ["start-hour", "start-minute", "end-hour", "end-minute"].some((id) => $(id).value);
  if (!anyTime || !$("start").value || !$("end").value) return;
  preview.hidden = false;
  try {
    const dates = datesBetween($("start").value, $("end").value);
    const timing = getTiming();
    $("start-holiday-label").hidden = dates.length !== 1;
    $("end-holiday-label").hidden = dates.length !== 1 || shiftTimes(timing).end <= 1440;
    const updates = dates.map((date) => ({ date, ...timing }));
    const proposed = new Map(entries);
    for (const entry of updates) proposed.set(entry.date, entry);
    const warnings = restWarnings([...proposed.values()]);
    if (!timing.start_time || !timing.end_time) throw new Error("Choose both start and end times.");
    const pay = estimate({ ...updates[0], ...timing });
    const warning = warnings.get(dates[0]);
    const summary = document.createElement("strong");
    summary.textContent = `${dates.length > 1 ? "First date: " : ""}${hours(pay.minutes)} paid · ${money(pay.cents)} ${pay.unpriced || warning ? "provisional gross subtotal" : "estimated gross pay"}`;
    preview.append(summary);
    const breakdown = document.createElement("ul");
    for (const line of pay.lines) {
      const item = document.createElement("li");
      item.textContent = `${line.label}: ${hours(line.minutes)}${line.rate === null ? "" : ` × $${(line.rate / 10000).toFixed(4)}/h`}`;
      breakdown.append(item);
    }
    preview.append(breakdown);
    if (warning || dates.length > 1) {
      const detail = document.createElement("div");
      detail.textContent = [warning, dates.length > 1 ? "Rates are calculated separately for each date. Enter holiday shifts individually." : ""].filter(Boolean).join(" ");
      preview.append(detail);
    }
  } catch (error) {
    preview.textContent = error.message;
  }
}

for (const id of ["start", "end", "start-hour", "start-minute", "end-hour", "end-minute", "start-holiday", "end-holiday"]) {
  $(id).addEventListener("input", previewPay);
  $(id).addEventListener("change", previewPay);
}

$("login-form").addEventListener("submit", handle(async () => {
  const controls = [...$("login-form").elements];
  if (controls.some((control) => control.disabled)) return;
  const email = $("email").value.trim();
  const password = $("password").value;
  controls.forEach((control) => { control.disabled = true; });
  message("Signing in…");
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.session) throw new Error("Sign-in did not return a session. Please try again.");
    await setSession(data.session);
  } finally {
    $("password").value = "";
    controls.forEach((control) => { control.disabled = false; });
  }
}));

$("sign-out").addEventListener("click", handle(async () => {
  const { error } = await client.auth.signOut();
  if (error) throw error;
  await setSession(null);
  message("Signed out.");
}));

for (const [id, delta] of [["previous", -1], ["next", 1]]) {
  $(id).addEventListener("click", () => {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    render();
  });
}
$("today").addEventListener("click", () => {
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  render();
});
$("range").addEventListener("click", () => openEditor(dateKey(new Date()), true));
$("cancel").addEventListener("click", () => $("editor").close());
$("editor").addEventListener("cancel", (event) => {
  if (saving) event.preventDefault();
});
$("refresh").addEventListener("click", handle(async () => {
  await load();
  message("Availability refreshed.");
}));
window.addEventListener("focus", handle(async () => { await load(); }));

async function saveAvailability(clear = false) {
  if (saving || !user) return;
  const controls = [...$("edit-form").elements];
  try {
    const dates = datesBetween($("start").value, $("end").value);
    const shift = $("shift").value;
    const site = $("site").value;
    const note = $("note").value.trim();
    if (!clear && (!["AM", "PM"].includes(shift) || !["NRDC", "WSDC", "HBDC"].includes(site))) {
      throw new Error("Choose a shift (AM or PM) and a site.");
    }
    const timing = clear ? null : getTiming();
    if (!clear && dates.length > 1 && dates.some((date) => {
      const entry = entries.get(date);
      return entry?.start_holiday || entry?.end_holiday;
    })) {
      throw new Error("This range includes a shift marked as a public holiday. Edit that shift individually to preserve its holiday setting.");
    }
    const currentUser = user.id;
    saving = true;
    controls.forEach((control) => { control.disabled = true; });
    $("edit-error").textContent = "";
    const result = clear
      ? await client.from("availability").delete().eq("user_id", currentUser).in("date", dates)
      : await client.from("availability").upsert(
        dates.map((date) => ({ user_id: currentUser, date, status: "busy", shift, site, note, ...timing })),
        { onConflict: "user_id,date" },
      );
    if (result.error) throw result.error;
    if (user?.id !== currentUser) return;
    $("editor").close();
    message("Saved.");
    try {
      await load();
    } catch (error) {
      message(`Saved, but refreshing failed: ${error.message}. Use Refresh to try again.`);
    }
  } catch (error) {
    $("edit-error").textContent = error instanceof Error ? error.message : String(error);
  } finally {
    saving = false;
    controls.forEach((control) => { control.disabled = false; });
  }
}

$("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  return saveAvailability();
});
$("clear").addEventListener("click", () => saveAvailability(true));

$("export").addEventListener("click", handle(async () => {
  await load();
  const backup = { version: 3, exportedAt: new Date().toISOString(), availability: [...entries.values()] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `availability-${dateKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));

handle(async () => {
  if (!SUPABASE_URL.startsWith("https://") || SUPABASE_KEY === "YOUR_SUPABASE_PUBLIC_KEY") {
    throw new Error("Setup required: add your Supabase project URL and public key to config.js. See README.md.");
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  client = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  await setSession(data.session);
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || session?.user?.id !== user?.id) {
      setTimeout(handle(async () => {
        if (session?.user?.id !== user?.id) await setSession(session);
      }), 0);
    }
  });
})();
