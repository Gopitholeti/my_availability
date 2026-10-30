import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
let client;
let user = null;
let entries = new Map();
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let requestId = 0;
let saving = false;
let ready = false;
const labels = { free: "Free", busy: "Busy", undecided: "Undecided" };

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
  for (let day = 1; day <= count; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = dateKey(date);
    const entry = entries.get(key);
    const status = entry?.status ?? "undecided";
    const button = document.createElement("button");
    button.className = `day ${status}${key === dateKey(new Date()) ? " today" : ""}`;
    button.disabled = !ready;
    button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, { dateStyle: "full" })}: ${labels[status]}${entry?.note ? `. ${entry.note}` : ""}`);
    if (key === dateKey(new Date())) button.setAttribute("aria-current", "date");
    const number = document.createElement("strong");
    number.textContent = String(day);
    const state = document.createElement("span");
    state.className = "day-status";
    state.textContent = labels[status];
    button.append(number, state);
    if (entry?.note) {
      const note = document.createElement("span");
      note.className = "day-note";
      note.textContent = entry.note;
      button.append(note);
    }
    button.addEventListener("click", () => openEditor(key));
    $("calendar").append(button);
  }
  $("range").disabled = !ready;
  $("export").disabled = !ready;
}

async function load() {
  if (!user) return;
  const currentUser = user.id;
  const id = ++requestId;
  const rows = [];
  let after = null;
  while (true) {
    let query = client.from("availability").select("date,status,note")
      .eq("user_id", currentUser).order("date").limit(500);
    if (after) query = query.gt("date", after);
    const { data, error } = await query;
    if (id !== requestId || user?.id !== currentUser) return;
    if (error) throw error;
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
  $("status").value = entry?.status ?? "undecided";
  $("note").value = entry?.note ?? "";
  $("edit-error").textContent = "";
  $("editor").showModal();
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

$("edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving || !user) return;
  const controls = [...$("edit-form").elements];
  try {
    const dates = datesBetween($("start").value, $("end").value);
    const status = $("status").value;
    const note = $("note").value.trim();
    const currentUser = user.id;
    saving = true;
    controls.forEach((control) => { control.disabled = true; });
    $("edit-error").textContent = "";
    const result = status === "undecided"
      ? await client.from("availability").delete().eq("user_id", currentUser).in("date", dates)
      : await client.from("availability").upsert(
        dates.map((date) => ({ user_id: currentUser, date, status, note })),
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
});

$("export").addEventListener("click", handle(async () => {
  await load();
  const backup = { version: 1, exportedAt: new Date().toISOString(), availability: [...entries.values()] };
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
