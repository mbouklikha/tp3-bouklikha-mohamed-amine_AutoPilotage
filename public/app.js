const state = { vehicles: [], editingId: null };

function show(section) {
  for (const s of ["dashboard", "vehicules", "stats"]) {
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

document.querySelectorAll(".sidebar nav a").forEach((a) => {
  a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.section); });
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
