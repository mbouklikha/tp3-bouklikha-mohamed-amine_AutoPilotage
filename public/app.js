const state = { vehicles: [], editingId: null, records: [], editingRecordId: null };

const TYPE_LABELS = { entretien: "Entretien", reparation: "Réparation", controle: "Contrôle technique", autre: "Autre" };

const SECTIONS = ["dashboard", "vehicules", "entretiens", "rappels", "stats", "fiche"];

function show(section) {
  for (const s of SECTIONS) {
    document.getElementById(`section-${s}`).hidden = s !== section;
  }
  document.querySelectorAll(".sidebar nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.section === section);
  });
  if (section !== "fiche" && window.location.hash !== `#${section}`) {
    window.location.hash = section;
  }
  if (section === "stats") loadStats();
  if (section === "dashboard") loadDashboard();
}

function currentVisible() {
  return SECTIONS.find((s) => !document.getElementById(`section-${s}`).hidden);
}

function route() {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("fiche/")) {
    const parts = h.split("/");
    const id = Number(parts[1]);
    const tab = parts[2] || "apercu";
    if (currentVisible() !== "fiche" || fiche.id !== id || fiche.tab !== tab) openFiche(id, tab);
  } else if (h !== "" && SECTIONS.includes(h) && h !== "fiche") {
    if (currentVisible() !== h) show(h);
  } else if (h === "" && currentVisible() !== "dashboard") {
    show("dashboard");
  }
}

window.addEventListener("hashchange", route);

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
    const ficheBtn = document.createElement("button");
    ficheBtn.textContent = "Fiche";
    ficheBtn.className = "ghost";
    ficheBtn.onclick = () => { window.location.hash = `fiche/${v.id}/apercu`; };
    const del = document.createElement("button");
    del.textContent = "Supprimer";
    del.className = "danger";
    del.onclick = () => removeVehicle(v);
    li.querySelector(".row-actions").append(ficheBtn, edit, del);
    list.appendChild(li);
  }
  const n = state.vehicles.length;
  const km = state.vehicles.reduce((s, v) => s + Number(v.mileage || 0), 0);
  document.getElementById("stat-count").textContent = String(n);
  document.getElementById("stat-km").textContent = `${km.toLocaleString("fr-FR")} km`;
}

const TYPE_LABELS_STATS = { entretien: "Entretien", reparation: "Réparation", controle: "Contrôle technique", autre: "Autre" };

function euros(n) {
  return `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function renderBars(containerId, items, labelOf) {
  const box = document.getElementById(containerId);
  box.innerHTML = "";
  const max = Math.max(0, ...items.map((i) => i.total));
  if (items.length === 0 || max === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Aucune dépense enregistrée.";
    box.appendChild(p);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span></span><div class="bar-track"><div class="bar-fill"></div></div><small></small>`;
    row.querySelector("span").textContent = labelOf(item);
    row.querySelector(".bar-fill").style.width = `${Math.max(1, Math.round((item.total / max) * 100))}%`;
    row.querySelector("small").textContent = `${euros(item.total)} (${item.count})`;
    box.appendChild(row);
  }
}

async function loadStats() {
  const err = document.getElementById("stats-error");
  err.hidden = true;
  try {
    const data = await api("/api/stats");
    const s = data.stats;
    document.getElementById("stats-loading").hidden = true;
    const hasData = s.vehicleCount > 0 || s.recordCount > 0;
    document.getElementById("stats-empty").hidden = hasData;
    document.getElementById("stats-content").hidden = !hasData;
    document.getElementById("stat-expenses").textContent = euros(s.totalCost);
    if (!hasData) return;
    document.getElementById("st-total").textContent = euros(s.totalCost);
    document.getElementById("st-count").textContent = `${s.recordCount} intervention(s)`;
    document.getElementById("st-avg").textContent = euros(s.averageCost);
    document.getElementById("st-vehicles").textContent = String(s.vehicleCount);
    document.getElementById("st-mileage").textContent = `${Number(s.totalMileage).toLocaleString("fr-FR")} km cumulés`;
    renderBars("chart-vehicles", s.byVehicle, (i) => `${i.brand} ${i.model}`);
    renderBars("chart-types", s.byType, (i) => TYPE_LABELS_STATS[i.type] || i.type);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("stats-loading").hidden = true;
  }
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
    loadDashboard();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("vehicles-loading").hidden = true;
  }
}

function startEdit(v) {
  state.editingId = v.id;
  const f = document.getElementById("vehicle-form");
  setSelectOrCustom("brand", v.brand);
  refreshModels();
  setSelectOrCustom("model", v.model);
  refreshYearsFuels();
  setSelectOrCustom("year", String(v.year));
  setSelectOrCustom("fuel", v.fuel || "");
  f.mileage.value = v.mileage;
  f.plate.value = v.plate || "";
  document.getElementById("form-title").textContent = "Modifier le véhicule";
  document.getElementById("form-submit").textContent = "Enregistrer";
  document.getElementById("form-cancel").hidden = false;
}

function resetForm() {
  state.editingId = null;
  document.getElementById("vehicle-form").reset();
  initCatalogSelects();
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
    brand: catalogValue("brand"), model: catalogValue("model"),
    year: Number(catalogValue("year")), mileage: Number(f.mileage.value),
    fuel: catalogValue("fuel"), plate: f.plate.value.trim(),
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

// ---- Catalogue automobile local (menus dépendants) ----

const CUSTOM = "__custom__";
let catalog = null;

function fillSelect(sel, options, placeholder) {
  sel.innerHTML = "";
  if (placeholder !== undefined) {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    sel.appendChild(ph);
  }
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  }
}

function catalogMakes() { return catalog && catalog.makes ? catalog.makes : []; }
function catalogModels(brand) {
  const make = catalogMakes().find((m) => m.brand === brand);
  return make ? make.models : [];
}
function catalogYears(brand, model) {
  const m = catalogModels(brand).find((x) => x.name === model);
  if (!m || !m.years) return [];
  const out = [];
  for (let y = m.years[1]; y >= m.years[0]; y--) out.push(String(y));
  return out;
}
function catalogFuels(brand, model) {
  const m = catalogModels(brand).find((x) => x.name === model);
  if (m && m.fuels) return m.fuels;
  if (catalog && catalog.fuels) return catalog.fuels;
  return [];
}

function toggleCustom(field, isCustom) {
  document.getElementById(`vf-${field}-custom-wrap`).hidden = !isCustom;
  const custom = document.getElementById(`vf-${field}-custom`);
  if (!isCustom) custom.value = "";
}

function refreshModels() {
  const brand = document.getElementById("vf-brand").value;
  const models = catalogModels(brand).map((m) => ({ value: m.name, label: m.name }));
  fillSelect(document.getElementById("vf-model"), [...models, { value: CUSTOM, label: "Autre… (saisie libre)" }], "— Choisir —");
  toggleCustom("model", false);
  refreshYearsFuels();
}

function refreshYearsFuels() {
  const brand = document.getElementById("vf-brand").value;
  const model = document.getElementById("vf-model").value;
  const years = catalogYears(brand, model).map((y) => ({ value: y, label: y }));
  fillSelect(document.getElementById("vf-year"), [...years, { value: CUSTOM, label: "Autre… (saisie libre)" }], "— Choisir —");
  toggleCustom("year", false);
  fillSelect(
    document.getElementById("vf-fuel"),
    [...catalogFuels(brand, model).map((f) => ({ value: f, label: f })), { value: CUSTOM, label: "Autre… (saisie libre)" }],
    "— Non précisée —",
  );
  toggleCustom("fuel", false);
}

function initCatalogSelects() {
  const brands = catalogMakes().map((m) => ({ value: m.brand, label: m.brand }));
  fillSelect(document.getElementById("vf-brand"), [...brands, { value: CUSTOM, label: "Autre… (saisie libre)" }], "— Choisir —");
  toggleCustom("brand", false);
  refreshModels();
}

function setSelectOrCustom(field, value) {
  const sel = document.getElementById(`vf-${field}`);
  const hasOption = [...sel.options].some((o) => o.value === value && value !== "");
  if (hasOption) {
    sel.value = value;
    toggleCustom(field, false);
  } else {
    if ([...sel.options].some((o) => o.value === CUSTOM)) sel.value = CUSTOM;
    document.getElementById(`vf-${field}-custom`).value = value;
    toggleCustom(field, true);
  }
}

function catalogValue(field) {
  const sel = document.getElementById(`vf-${field}`);
  if (sel.value === CUSTOM) return document.getElementById(`vf-${field}-custom`).value.trim();
  return sel.value.trim();
}

async function loadCatalog() {
  try {
    const res = await fetch("/catalog.json");
    if (!res.ok) throw new Error("catalogue indisponible");
    catalog = await res.json();
  } catch {
    catalog = null;
  }
  initCatalogSelects();
}

document.getElementById("vf-brand").addEventListener("change", (e) => {
  toggleCustom("brand", e.target.value === CUSTOM);
  refreshModels();
});
document.getElementById("vf-model").addEventListener("change", (e) => {
  toggleCustom("model", e.target.value === CUSTOM);
  refreshYearsFuels();
});
document.getElementById("vf-year").addEventListener("change", (e) => {
  toggleCustom("year", e.target.value === CUSTOM);
});
document.getElementById("vf-fuel").addEventListener("change", (e) => {
  toggleCustom("fuel", e.target.value === CUSTOM);
});

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

// ---- Fiche véhicule ----

const fiche = { id: null, tab: "apercu", vehicle: null, records: [], total: 0, reminders: [], plan: null };
const FTABS = ["apercu", "entretiens", "rappels", "plan"];

function openFiche(id, tab) {
  if (!Number.isInteger(id) || id <= 0) {
    show("vehicules");
    return;
  }
  fiche.id = id;
  fiche.tab = FTABS.includes(tab) ? tab : "apercu";
  show("fiche");
  const target = `#fiche/${id}/${fiche.tab}`;
  if (window.location.hash !== target) window.location.hash = target;
  document.querySelectorAll("#section-fiche [data-ftab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.ftab === fiche.tab);
  });
  for (const t of FTABS) document.getElementById(`ftab-${t}`).hidden = t !== fiche.tab;
  loadFiche();
  if (fiche.tab === "plan") loadFichePlan();
}

async function loadFiche() {
  const err = document.getElementById("fiche-error");
  err.hidden = true;
  document.getElementById("fiche-loading").hidden = false;
  document.getElementById("fiche-content").hidden = true;
  try {
    const [vData, mData, rData] = await Promise.all([
      api(`/api/vehicles/${fiche.id}`),
      api(`/api/vehicles/${fiche.id}/maintenance`),
      api(`/api/reminders?vehicle_id=${fiche.id}`),
    ]);
    fiche.vehicle = vData.vehicle;
    fiche.records = mData.records || [];
    fiche.total = mData.total || 0;
    fiche.reminders = rData.reminders || [];
    renderFiche();
    document.getElementById("fiche-loading").hidden = true;
    document.getElementById("fiche-content").hidden = false;
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    document.getElementById("fiche-loading").hidden = true;
  }
}

function ficheLine(label, value) {
  const p = document.createElement("p");
  const b = document.createElement("strong");
  b.textContent = `${label} : `;
  const s = document.createElement("span");
  s.textContent = value;
  p.append(b, s);
  return p;
}

function renderFiche() {
  const v = fiche.vehicle;
  document.getElementById("fiche-title").textContent = `${v.brand} ${v.model}`;
  document.getElementById("fiche-sub").textContent =
    [v.year, v.fuel, v.plate, `${Number(v.mileage).toLocaleString("fr-FR")} km`].filter(Boolean).join(" · ");
  document.getElementById("fiche-total").textContent = euros(fiche.total);
  document.getElementById("fiche-count").textContent = `${fiche.records.length} intervention(s)`;
  const late = fiche.reminders.filter((r) => r.status === "en_retard");
  const upcoming = fiche.reminders.filter((r) => r.status === "a_venir");
  document.getElementById("fiche-late").textContent = String(late.length);
  document.getElementById("fiche-upcoming").textContent = String(upcoming.length);

  const info = document.getElementById("fiche-info");
  info.innerHTML = "";
  const missing = (x) => (x === undefined || x === null || x === "" ? "Non renseigné" : String(x));
  info.append(
    ficheLine("Marque", missing(v.brand)), ficheLine("Modèle", missing(v.model)),
    ficheLine("Année", missing(v.year)), ficheLine("Motorisation", missing(v.fuel)),
    ficheLine("Immatriculation", missing(v.plate)),
    ficheLine("Kilométrage", `${Number(v.mileage).toLocaleString("fr-FR")} km`),
  );

  const last = document.getElementById("fiche-last");
  last.innerHTML = "";
  if (fiche.records.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Aucune intervention enregistrée pour ce véhicule.";
    last.appendChild(li);
  }
  for (const r of fiche.records.slice(0, 3)) {
    const li = document.createElement("li");
    li.className = "vehicle-card";
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `${TYPE_LABELS[r.type] || r.type} — ${r.title} — ${euros(r.cost)}`;
    const small = document.createElement("small");
    small.textContent = `${r.date} · ${Number(r.mileage).toLocaleString("fr-FR")} km`;
    div.append(strong, small);
    li.appendChild(div);
    last.appendChild(li);
  }

  const next = document.getElementById("fiche-next");
  next.innerHTML = "";
  const pending = [...late, ...upcoming].slice(0, 5);
  if (pending.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Aucune échéance à venir pour ce véhicule.";
    next.appendChild(li);
  }
  for (const r of pending) {
    const li = document.createElement("li");
    li.className = `vehicle-card status-${r.status}`;
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = r.title;
    const small = document.createElement("small");
    const bits = [];
    if (r.due_date) bits.push(`échéance : ${r.due_date}`);
    if (r.due_mileage !== undefined) bits.push(`${Number(r.due_mileage).toLocaleString("fr-FR")} km`);
    small.textContent = bits.join(" · ");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = REM_STATUS[r.status] || r.status;
    div.append(strong, small, badge);
    li.appendChild(div);
    next.appendChild(li);
  }

  const mList = document.getElementById("fiche-maint-list");
  mList.innerHTML = "";
  document.getElementById("fiche-maint-empty").hidden = fiche.records.length !== 0;
  for (const r of fiche.records) {
    const li = document.createElement("li");
    li.className = "vehicle-card";
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `${TYPE_LABELS[r.type] || r.type} — ${r.title} — ${euros(r.cost)}`;
    const small = document.createElement("small");
    small.textContent = [`${r.date}`, `${Number(r.mileage).toLocaleString("fr-FR")} km`, r.description].filter(Boolean).join(" · ");
    div.append(strong, small);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.type = "button"; edit.textContent = "Modifier";
    edit.onclick = () => { startRecordEdit(r); show("entretiens"); };
    const del = document.createElement("button");
    del.type = "button"; del.textContent = "Supprimer"; del.className = "danger";
    del.onclick = async () => {
      if (!window.confirm(`Supprimer « ${r.title} » ?`)) return;
      await api(`/api/vehicles/${fiche.id}/maintenance/${r.id}`, { method: "DELETE" });
      await loadFiche();
      await load();
    };
    actions.append(edit, del);
    li.append(div, actions);
    mList.appendChild(li);
  }

  const rList = document.getElementById("fiche-rem-list");
  rList.innerHTML = "";
  document.getElementById("fiche-rem-empty").hidden = fiche.reminders.length !== 0;
  for (const r of fiche.reminders) {
    const li = document.createElement("li");
    li.className = `vehicle-card status-${r.status}`;
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = r.title;
    const small = document.createElement("small");
    const bits = [];
    if (r.due_date) bits.push(`échéance : ${r.due_date}`);
    if (r.due_mileage !== undefined) bits.push(`${Number(r.due_mileage).toLocaleString("fr-FR")} km`);
    small.textContent = bits.join(" · ");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = REM_STATUS[r.status] || r.status;
    div.append(strong, small, badge);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (r.status !== "termine") {
      const done = document.createElement("button");
      done.type = "button"; done.textContent = "Terminer";
      done.onclick = async () => { await setReminderDone(r, true); await loadFiche(); };
      const edit = document.createElement("button");
      edit.type = "button"; edit.textContent = "Modifier";
      edit.onclick = () => { startReminderEdit(r); show("rappels"); };
      actions.append(done, edit);
    } else {
      const reopen = document.createElement("button");
      reopen.type = "button"; reopen.textContent = "Rouvrir";
      reopen.onclick = async () => { await setReminderDone(r, false); await loadFiche(); };
      actions.appendChild(reopen);
    }
    const del = document.createElement("button");
    del.type = "button"; del.textContent = "Supprimer"; del.className = "danger";
    del.onclick = async () => {
      if (!window.confirm(`Supprimer le rappel « ${r.title} » ?`)) return;
      await api(`/api/reminders/${r.id}`, { method: "DELETE" });
      await loadFiche();
      await load();
    };
    actions.appendChild(del);
    li.append(div, actions);
    rList.appendChild(li);
  }
}

document.querySelectorAll("#section-fiche [data-ftab]").forEach((b) => {
  b.addEventListener("click", () => {
    if (fiche.id !== null) openFiche(fiche.id, b.dataset.ftab);
  });
});

// ---- Plan d'entretien (suggestions, aucune création automatique) ----

function planDueText(s) {
  const bits = [];
  if (s.due_date) bits.push(`échéance : ${s.due_date}`);
  if (s.due_mileage !== undefined) bits.push(`${Number(s.due_mileage).toLocaleString("fr-FR")} km`);
  if (s.uncertain) bits.push("estimation à ajuster (sans historique fiable)");
  bits.push("intervalle indicatif");
  return bits.join(" · ");
}

async function loadFichePlan() {
  const err = document.getElementById("fiche-plan-error");
  const loading = document.getElementById("fiche-plan-loading");
  const result = document.getElementById("fiche-plan-result");
  err.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  try {
    const data = await api(`/api/vehicles/${fiche.id}/plan`);
    fiche.plan = data;
    loading.hidden = true;
    renderFichePlan();
  } catch (e) {
    loading.hidden = true;
    err.textContent = e.message;
    err.hidden = false;
  }
}

function renderFichePlan() {
  const plan = fiche.plan;
  const list = document.getElementById("fiche-plan-list");
  const empty = document.getElementById("fiche-plan-empty");
  const skippedBox = document.getElementById("fiche-plan-skipped");
  list.innerHTML = "";
  if (!plan) return;
  document.getElementById("fiche-plan-disclaimer").textContent = plan.disclaimer || "";
  const suggestions = plan.suggestions || [];
  empty.hidden = suggestions.length !== 0;
  for (const s of suggestions) {
    const li = document.createElement("li");
    li.className = "vehicle-card";
    const label = document.createElement("label");
    label.className = "plan-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.value = s.category;
    check.setAttribute("aria-label", `Créer un rappel : ${s.label}`);
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = s.label;
    const small = document.createElement("small");
    small.textContent = planDueText(s);
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = s.overdue ? "En retard" : "À venir";
    div.append(strong, small, badge);
    label.append(check, div);
    li.appendChild(label);
    list.appendChild(li);
  }
  const skipped = plan.skipped || [];
  if (skipped.length === 0) {
    skippedBox.hidden = true;
  } else {
    skippedBox.hidden = false;
    skippedBox.textContent = `Non proposé : ${skipped.map((x) => x.category).join(", ")} (déjà suivi, non applicable ou à vérifier).`;
  }
}

document.getElementById("fiche-plan-submit").addEventListener("click", async () => {
  const err = document.getElementById("fiche-plan-error");
  const result = document.getElementById("fiche-plan-result");
  err.hidden = true;
  result.hidden = true;
  const categories = [...document.querySelectorAll("#fiche-plan-list input[type=checkbox]:checked")].map((c) => c.value);
  if (categories.length === 0) {
    err.textContent = "Sélectionnez au moins une suggestion à créer.";
    err.hidden = false;
    return;
  }
  try {
    const data = await api(`/api/vehicles/${fiche.id}/plan`, {
      method: "POST",
      body: JSON.stringify({ categories }),
    });
    const n = (data.created || []).length;
    result.textContent = n === 1 ? "1 rappel créé." : `${n} rappels créés.`;
    result.hidden = false;
    await loadFichePlan();
    await loadFiche();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
});
document.getElementById("fiche-back").addEventListener("click", () => show("dashboard"));
document.getElementById("fiche-edit").addEventListener("click", () => {
  if (!fiche.vehicle) return;
  show("vehicules");
  startEdit(fiche.vehicle);
  document.getElementById("vehicle-form").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("fiche-pdf").addEventListener("click", () => {
  if (fiche.id !== null) window.location.href = `/api/vehicles/${fiche.id}/report.pdf`;
});
document.getElementById("fiche-maint-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("fiche-maint-error");
  err.hidden = true;
  try {
    await api(`/api/vehicles/${fiche.id}/maintenance`, {
      method: "POST",
      body: JSON.stringify({
        type: f.type.value, title: f.title.value.trim(), description: f.description.value.trim(),
        date: f.date.value, mileage: Number(f.mileage.value), cost: Number(f.cost.value),
      }),
    });
    f.reset();
    await loadFiche();
    await load();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
document.getElementById("fiche-rem-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("fiche-rem-error");
  err.hidden = true;
  try {
    await api("/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        vehicle_id: fiche.id, title: f.title.value.trim(), due_date: f.due_date.value,
        due_mileage: f.due_mileage.value === "" ? undefined : Number(f.due_mileage.value),
      }),
    });
    f.reset();
    await loadFiche();
    await load();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---- Tableau de bord ----

function goToVehicleSection(vehicleId, what) {
  show(what === "reminders" ? "rappels" : what === "maintenance" ? "entretiens" : "vehicules");
  const sel = document.getElementById(what === "reminders" ? "rem-vehicle" : "maint-vehicle");
  if (sel && vehicleId !== undefined) {
    sel.value = String(vehicleId);
    sel.dispatchEvent(new Event("change"));
  }
  if (what === "edit") {
    const v = state.vehicles.find((x) => x.id === vehicleId);
    if (v) { startEdit(v); document.getElementById("vehicle-form").scrollIntoView({ behavior: "smooth" }); }
  }
}

async function loadDashboard() {
  const err = document.getElementById("dash-error");
  const content = document.getElementById("dash-content");
  err.hidden = true;
  try {
    const [statsData, remData] = await Promise.all([api("/api/stats"), api("/api/reminders")]);
    const s = statsData.stats;
    const reminders = remData.reminders || [];
    content.hidden = false;
    document.getElementById("stat-count").textContent = String(s.vehicleCount);
    document.getElementById("stat-km").textContent = `${Number(s.totalMileage).toLocaleString("fr-FR")} km cumulés`;
    document.getElementById("stat-expenses").textContent = euros(s.totalCost);
    const late = reminders.filter((r) => r.status === "en_retard");
    const upcoming = reminders.filter((r) => r.status === "a_venir");
    document.getElementById("stat-late").textContent = String(late.length);
    document.getElementById("stat-upcoming").textContent = String(upcoming.length);
    document.getElementById("kpi-late").classList.toggle("alert-card", late.length > 0);

    const alerts = document.getElementById("dash-alerts");
    alerts.innerHTML = "";
    if (late.length === 0) {
      const li = document.createElement("li");
      li.className = "ok-line";
      li.textContent = "✓ Tout est à jour — aucun rappel en retard.";
      alerts.appendChild(li);
    } else {
      for (const r of late.slice(0, 5)) {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = `${r.title} — ${r.vehicle.brand} ${r.vehicle.model}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Voir";
        btn.onclick = () => goToVehicleSection(r.vehicle_id, "reminders");
        li.append(span, btn);
        alerts.appendChild(li);
      }
    }

    const grid = document.getElementById("garage-grid");
    grid.innerHTML = "";
    document.getElementById("dash-empty").hidden = state.vehicles.length !== 0;
    const spentByVehicle = new Map(s.byVehicle.map((b) => [b.vehicle_id, b]));
    state.vehicles.forEach((v) => {
      const spent = spentByVehicle.get(v.id);
      const isLate = late.some((r) => r.vehicle_id === v.id);
      const card = document.createElement("article");
      card.className = "car-card";
      const visual = document.createElement("div");
      visual.className = "car-visual";
      const generic = document.createElement("div");
      generic.className = "car-generic";
      generic.setAttribute("aria-hidden", "true");
      const initial = document.createElement("span");
      initial.textContent = (v.brand || "?").trim().charAt(0).toUpperCase() || "?";
      generic.appendChild(initial);
      visual.appendChild(generic);
      const tag = document.createElement("span");
      tag.className = "illus";
      tag.textContent = "Visuel générique";
      visual.appendChild(tag);
      const info = document.createElement("div");
      info.className = "car-info";
      const name = document.createElement("strong");
      name.textContent = `${v.brand} ${v.model}`;
      const meta = document.createElement("p");
      meta.className = "car-meta";
      meta.textContent = [v.year, v.fuel, v.plate, `${Number(v.mileage).toLocaleString("fr-FR")} km`].filter(Boolean).join(" · ");
      const status = document.createElement("span");
      status.className = isLate ? "car-status warn" : "car-status";
      status.textContent = isLate ? "● À surveiller" : "● Suivi OK";
      const spentLine = document.createElement("p");
      spentLine.className = "car-meta";
      spentLine.textContent = spent ? `${euros(spent.total)} · ${spent.count} intervention(s)` : "Aucune dépense enregistrée";
      const actions = document.createElement("div");
      actions.className = "car-actions";
      const bMaint = document.createElement("button");
      bMaint.type = "button"; bMaint.textContent = "🔧 Entretiens";
      bMaint.onclick = () => { window.location.hash = `fiche/${v.id}/entretiens`; };
      const bRem = document.createElement("button");
      bRem.type = "button"; bRem.textContent = "⏰ Rappels"; bRem.className = "ghost";
      bRem.onclick = () => { window.location.hash = `fiche/${v.id}/rappels`; };
      const bEdit = document.createElement("button");
      bEdit.type = "button"; bEdit.textContent = "✏️ Gérer"; bEdit.className = "ghost";
      bEdit.onclick = () => goToVehicleSection(v.id, "edit");
      actions.append(bMaint, bRem, bEdit);
      info.append(name, meta, status, spentLine, actions);
      card.append(visual, info);
      grid.appendChild(card);
    });
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

document.getElementById("cta-add-vehicle").addEventListener("click", () => {
  show("vehicules");
  document.getElementById("vehicle-form").scrollIntoView({ behavior: "smooth" });
  const brand = document.querySelector('#vehicle-form input[name="brand"]');
  if (brand) brand.focus();
});
document.getElementById("cta-add-reminder").addEventListener("click", () => {
  show("rappels");
  document.getElementById("rem-form").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("cta-manage").addEventListener("click", () => show("vehicules"));

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

loadCatalog();
route();
load();
