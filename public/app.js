const state = { vehicles: [], editingId: null, records: [], editingRecordId: null };

const TYPE_LABELS = { entretien: "Entretien", reparation: "Réparation", controle: "Contrôle technique", autre: "Autre" };

function show(section) {
  for (const s of ["dashboard", "vehicules", "entretiens", "rappels", "stats"]) {
    document.getElementById(`section-${s}`).hidden = s !== section;
  }
  document.querySelectorAll(".sidebar nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.section === section);
  });
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function render() {
  const list = document.getElementById("vehicles-list");
  const empty = document.getElementById("vehicles-empty");
  const loading = document.getElementById("vehicles-loading");
  loading.hidden = true;
  list.innerHTML = "";
  empty.hidden = state.vehicles.length !== 0;
  for (const v of state.vehicles) {
    const li = document.createElement("li");
    li.className = "vehicle-card";
    const sub = [v.year, v.fuel, v.plate, `${Number(v.mileage).toLocaleString("fr-FR")} km`]
      .filter(Boolean).join(" · ");
    li.innerHTML = `<div><strong></strong><small></small></div><div class="row-actions"></div>`;
    li.querySelector("strong").textContent = `${v.brand} ${v.model}`;
    li.querySelector("small").textContent = sub;
    const edit = document.createElement("button");
    edit.textContent = "Modifier";
    edit.onclick = () => startEdit(v);
    const del = document.createElement("button");
    del.textContent = "Supprimer";
    del.className = "danger";
    del.onclick = () => removeVehicle(v);
    li.querySelector(".row-actions").append(edit, del);
    list.appendChild(li);
  }
  const n = state.vehicles.length;
  const km = state.vehicles.reduce((s, v) => s + Number(v.mileage || 0), 0);
  document.getElementById("stat-count").textContent = String(n);
  document.getElementById("stat-km").textContent = `${km.toLocaleString("fr-FR")} km`;
  document.getElementById("stats-count").textContent = String(n);
  document.getElementById("stats-km").textContent = `${km.toLocaleString("fr-FR")} km`;
}

async function load() {
  const err = document.getElementById("vehicles-error");
  err.hidden = true;
  try {
    const data = await api("/api/vehicles");
    state.vehicles = data.vehicles || [];
    render();
    syncMaintVehicleSelect();
    syncRemVehicleSelect();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("vehicles-loading").hidden = true;
  }
}

function startEdit(v) {
  state.editingId = v.id;
  const f = document.getElementById("vehicle-form");
  f.brand.value = v.brand; f.model.value = v.model;
  f.year.value = v.year; f.mileage.value = v.mileage;
  f.fuel.value = v.fuel || ""; f.plate.value = v.plate || "";
  document.getElementById("form-title").textContent = "Modifier le véhicule";
  document.getElementById("form-submit").textContent = "Enregistrer";
  document.getElementById("form-cancel").hidden = false;
}

function resetForm() {
  state.editingId = null;
  document.getElementById("vehicle-form").reset();
  document.getElementById("form-title").textContent = "Ajouter un véhicule";
  document.getElementById("form-submit").textContent = "Ajouter";
  document.getElementById("form-cancel").hidden = true;
  document.getElementById("form-error").hidden = true;
}

async function removeVehicle(v) {
  if (!window.confirm(`Supprimer ${v.brand} ${v.model} ?`)) return;
  await api(`/api/vehicles/${v.id}`, { method: "DELETE" });
  await load();
}

document.getElementById("vehicle-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("form-error");
  err.hidden = true;
  const body = {
    brand: f.brand.value.trim(), model: f.model.value.trim(),
    year: Number(f.year.value), mileage: Number(f.mileage.value),
    fuel: f.fuel.value.trim(), plate: f.plate.value.trim(),
  };
  try {
    if (state.editingId === null) {
      await api("/api/vehicles", { method: "POST", body: JSON.stringify(body) });
    } else {
      await api(`/api/vehicles/${state.editingId}`, { method: "PUT", body: JSON.stringify(body) });
    }
    resetForm();
    await load();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
document.getElementById("form-cancel").addEventListener("click", resetForm);

// ---- Entretiens et réparations ----

function selectedVehicleId() {
  const v = document.getElementById("maint-vehicle").value;
  return v === "" ? null : Number(v);
}

function syncMaintVehicleSelect() {
  const sel = document.getElementById("maint-vehicle");
  const current = sel.value;
  sel.innerHTML = "";
  for (const v of state.vehicles) {
    const opt = document.createElement("option");
    opt.value = String(v.id);
    opt.textContent = `${v.brand} ${v.model}`;
    sel.appendChild(opt);
  }
  if (state.vehicles.some((v) => String(v.id) === current)) sel.value = current;
  loadRecords();
}

function renderRecords() {
  const list = document.getElementById("maint-list");
  const empty = document.getElementById("maint-empty");
  document.getElementById("maint-loading").hidden = true;
  list.innerHTML = "";
  empty.hidden = state.records.length !== 0;
  for (const r of state.records) {
    const li = document.createElement("li");
    li.className = "vehicle-card";
    li.innerHTML = `<div><strong></strong><small></small></div><div class="row-actions"></div>`;
    li.querySelector("strong").textContent = `${TYPE_LABELS[r.type] || r.type} — ${r.title} — ${Number(r.cost).toLocaleString("fr-FR")} €`;
    li.querySelector("small").textContent =
      [`${r.date}`, `${Number(r.mileage).toLocaleString("fr-FR")} km`, r.description].filter(Boolean).join(" · ");
    const edit = document.createElement("button");
    edit.textContent = "Modifier";
    edit.onclick = () => startRecordEdit(r);
    const del = document.createElement("button");
    del.textContent = "Supprimer";
    del.className = "danger";
    del.onclick = () => removeRecord(r);
    li.querySelector(".row-actions").append(edit, del);
    list.appendChild(li);
  }
}

async function loadRecords() {
  const err = document.getElementById("maint-error");
  err.hidden = true;
  const vid = selectedVehicleId();
  if (vid === null) {
    document.getElementById("maint-loading").hidden = true;
    document.getElementById("maint-empty").hidden = false;
    document.getElementById("maint-list").innerHTML = "";
    document.getElementById("maint-total").textContent = "Total : —";
    return;
  }
  try {
    const data = await api(`/api/vehicles/${vid}/maintenance`);
    state.records = data.records || [];
    document.getElementById("maint-total").textContent =
      `Total : ${Number(data.total || 0).toLocaleString("fr-FR")} €`;
    renderRecords();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("maint-loading").hidden = true;
  }
}

function startRecordEdit(r) {
  state.editingRecordId = r.id;
  const f = document.getElementById("maint-form");
  f.type.value = r.type; f.title.value = r.title;
  f.date.value = r.date; f.mileage.value = r.mileage; f.cost.value = r.cost;
  f.description.value = r.description || "";
  document.getElementById("maint-form-title").textContent = "Modifier l'intervention";
  document.getElementById("maint-submit").textContent = "Enregistrer";
  document.getElementById("maint-cancel").hidden = false;
}

function resetRecordForm() {
  state.editingRecordId = null;
  document.getElementById("maint-form").reset();
  document.getElementById("maint-form-title").textContent = "Ajouter une intervention";
  document.getElementById("maint-submit").textContent = "Ajouter";
  document.getElementById("maint-cancel").hidden = true;
  document.getElementById("maint-form-error").hidden = true;
}

async function removeRecord(r) {
  if (!window.confirm(`Supprimer « ${r.title} » ?`)) return;
  await api(`/api/vehicles/${r.vehicle_id}/maintenance/${r.id}`, { method: "DELETE" });
  await loadRecords();
}

document.getElementById("maint-vehicle").addEventListener("change", () => { resetRecordForm(); loadRecords(); });
document.getElementById("maint-cancel").addEventListener("click", resetRecordForm);
document.getElementById("maint-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("maint-form-error");
  err.hidden = true;
  const vid = selectedVehicleId();
  if (vid === null) { err.textContent = "Choisissez d'abord un véhicule."; err.hidden = false; return; }
  const body = {
    type: f.type.value, title: f.title.value.trim(), description: f.description.value.trim(),
    date: f.date.value, mileage: Number(f.mileage.value), cost: Number(f.cost.value),
  };
  try {
    if (state.editingRecordId === null) {
      await api(`/api/vehicles/${vid}/maintenance`, { method: "POST", body: JSON.stringify(body) });
    } else {
      await api(`/api/vehicles/${vid}/maintenance/${state.editingRecordId}`, { method: "PUT", body: JSON.stringify(body) });
    }
    resetRecordForm();
    await loadRecords();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

document.querySelectorAll(".sidebar nav a").forEach((a) => {
  a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.section); });
});

// ---- Rappels ----

const REM_STATUS = { a_venir: "À venir", en_retard: "En retard", termine: "Terminé" };
const remState = { reminders: [], filter: "", editingId: null };

function syncRemVehicleSelect() {
  const sel = document.getElementById("rem-vehicle");
  const current = sel.value;
  sel.innerHTML = "";
  for (const v of state.vehicles) {
    const opt = document.createElement("option");
    opt.value = String(v.id);
    opt.textContent = `${v.brand} ${v.model}`;
    sel.appendChild(opt);
  }
  if (state.vehicles.some((v) => String(v.id) === current)) sel.value = current;
  loadReminders();
}

function renderReminders() {
  const list = document.getElementById("rem-list");
  const empty = document.getElementById("rem-empty");
  document.getElementById("rem-loading").hidden = true;
  list.innerHTML = "";
  empty.hidden = remState.reminders.length !== 0;
  for (const r of remState.reminders) {
    const li = document.createElement("li");
    li.className = `vehicle-card status-${r.status}`;
    li.innerHTML = `<div><strong></strong><small></small><span class="badge"></span></div><div class="row-actions"></div>`;
    li.querySelector("strong").textContent = r.title;
    const details = [`${r.vehicle.brand} ${r.vehicle.model}`];
    if (r.due_date) details.push(`échéance : ${r.due_date}`);
    if (r.due_mileage !== undefined) details.push(`${Number(r.due_mileage).toLocaleString("fr-FR")} km`);
    li.querySelector("small").textContent = details.join(" · ");
    li.querySelector(".badge").textContent = REM_STATUS[r.status] || r.status;
    const actions = li.querySelector(".row-actions");
    if (r.status !== "termine") {
      const done = document.createElement("button");
      done.textContent = "Terminer";
      done.onclick = () => setReminderDone(r, true);
      actions.appendChild(done);
      const edit = document.createElement("button");
      edit.textContent = "Modifier";
      edit.onclick = () => startReminderEdit(r);
      actions.appendChild(edit);
    } else {
      const reopen = document.createElement("button");
      reopen.textContent = "Rouvrir";
      reopen.onclick = () => setReminderDone(r, false);
      actions.appendChild(reopen);
    }
    const del = document.createElement("button");
    del.textContent = "Supprimer";
    del.className = "danger";
    del.onclick = () => removeReminder(r);
    actions.appendChild(del);
    list.appendChild(li);
  }
}

async function loadReminders() {
  const err = document.getElementById("rem-error");
  err.hidden = true;
  try {
    const q = remState.filter === "" ? "" : `?status=${remState.filter}`;
    const data = await api(`/api/reminders${q}`);
    remState.reminders = data.reminders || [];
    renderReminders();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("rem-loading").hidden = true;
  }
}

async function setReminderDone(r, done) {
  await api(`/api/reminders/${r.id}`, {
    method: "PUT",
    body: JSON.stringify({
      vehicle_id: r.vehicle_id, title: r.title,
      due_date: r.due_date || "", due_mileage: r.due_mileage, done,
    }),
  });
  await loadReminders();
}

function startReminderEdit(r) {
  remState.editingId = r.id;
  const f = document.getElementById("rem-form");
  f.vehicle_id.value = String(r.vehicle_id);
  f.title.value = r.title;
  f.due_date.value = r.due_date || "";
  f.due_mileage.value = r.due_mileage === undefined ? "" : String(r.due_mileage);
  document.getElementById("rem-form-title").textContent = "Modifier le rappel";
  document.getElementById("rem-submit").textContent = "Enregistrer";
  document.getElementById("rem-cancel").hidden = false;
}

function resetReminderForm() {
  remState.editingId = null;
  document.getElementById("rem-form").reset();
  document.getElementById("rem-form-title").textContent = "Ajouter un rappel";
  document.getElementById("rem-submit").textContent = "Ajouter";
  document.getElementById("rem-cancel").hidden = true;
  document.getElementById("rem-form-error").hidden = true;
}

async function removeReminder(r) {
  if (!window.confirm(`Supprimer le rappel « ${r.title} » ?`)) return;
  await api(`/api/reminders/${r.id}`, { method: "DELETE" });
  await loadReminders();
}

document.querySelectorAll("#section-rappels .filters button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#section-rappels .filters button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    remState.filter = b.dataset.filter;
    loadReminders();
  });
});
document.getElementById("rem-cancel").addEventListener("click", resetReminderForm);
document.getElementById("rem-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("rem-form-error");
  err.hidden = true;
  const dueMileage = f.due_mileage.value === "" ? undefined : Number(f.due_mileage.value);
  const body = {
    vehicle_id: Number(f.vehicle_id.value), title: f.title.value.trim(),
    due_date: f.due_date.value, due_mileage: dueMileage,
  };
  try {
    if (remState.editingId === null) {
      await api("/api/reminders", { method: "POST", body: JSON.stringify(body) });
    } else {
      await api(`/api/reminders/${remState.editingId}`, { method: "PUT", body: JSON.stringify(body) });
    }
    resetReminderForm();
    await loadReminders();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

fetch("/api/health")
  .then((r) => r.json())
  .then((d) => {
    const el = document.getElementById("server-status");
    if (el) { el.textContent = d && d.ok ? "en ligne" : "réponse inattendue"; el.className = d && d.ok ? "ok" : "ko"; }
  })
  .catch(() => {
    const el = document.getElementById("server-status");
    if (el) { el.textContent = "hors ligne"; el.className = "ko"; }
  });

load();
