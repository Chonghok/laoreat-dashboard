let deliveryTypesAll = [];
let deliveryTypesById = new Map();

let toastTimer;

// ---------- Toast ----------
function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast ${type}`;
    void toast.offsetWidth;
    toast.classList.add("show");

    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---------- Confirm Modal ----------
const confirmOverlay = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelConfirm");
let confirmAction = null;

function openConfirm({ title, message, type = "updateConfirm", onConfirm }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmBtn.className = "confirm-btn " + type;
    confirmAction = onConfirm;
    confirmOverlay.classList.add("active");
}

function closeConfirm() {
    confirmOverlay.classList.remove("active");
    confirmAction = null;
}

confirmOverlay?.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeConfirm();
});

cancelBtn?.addEventListener("click", closeConfirm);

confirmBtn?.addEventListener("click", async () => {
    if (typeof confirmAction !== "function") return;
    confirmBtn.disabled = true;
    try {
        await confirmAction();
    } finally {
        confirmBtn.disabled = false;
    }
});

// ---------- Helpers ----------
function viewerRole() {
    return String(window.__ADMIN__?.role || "").toLowerCase();
}

function canManageDeliveryTypes() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager";
}

function isOn(v) {
    return Number(v) === 1 || v === true || v === "1";
}

function money(n) {
    const num = Number(n ?? 0);
    return `$${num.toFixed(2)}`;
}

function scrollModalToTop(overlayEl) {
    const modal = overlayEl?.querySelector(".modal");
    if (modal) {
        modal.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function normalizeCode(v) {
    return String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "");
}

// ---------- API ----------
async function apiFetch(path, opts = {}) {
    const token = (typeof getToken === "function") ? getToken() : null;

    const headers = {
        Accept: "application/json",
        ...(opts.headers || {}),
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        throw new Error(json?.message || `Request failed (${res.status})`);
    }

    return json;
}

// ---------- Load ----------
async function loadDeliveryTypes() {
    const json = await apiFetch("/api/delivery-types");
    deliveryTypesAll = json.data || [];
    deliveryTypesById = new Map(deliveryTypesAll.map(x => [String(x.id), x]));
}

// ---------- Filtering ----------
function getFiltered() {
    const q = (document.getElementById("deliverySearch")?.value || "").trim().toLowerCase();
    const showAll = !!document.getElementById("showAllDeliveryTypes")?.checked;

    let arr = deliveryTypesAll;

    if (!showAll) {
        arr = arr.filter(x => isOn(x.is_active));
    }

    if (q) {
        arr = arr.filter(x => {
            const idStr = String(x.id || "");
            const name = String(x.name || "").toLowerCase();
            const code = String(x.code || "").toLowerCase();

            return idStr.includes(q) || name.includes(q) || code.includes(q);
        });
    }

    return arr;
}

// ---------- Local patch helpers ----------
function upsertLocalDeliveryType(item) {
    const id = String(item.id);
    const idx = deliveryTypesAll.findIndex(x => String(x.id) === id);

    if (idx >= 0) deliveryTypesAll[idx] = { ...deliveryTypesAll[idx], ...item };
    else deliveryTypesAll.push(item);

    deliveryTypesAll.sort((a, b) => Number(a.id) - Number(b.id));
    deliveryTypesById = new Map(deliveryTypesAll.map(x => [String(x.id), x]));
}

function patchLocalDeliveryType(id, patch) {
    const key = String(id);
    const item = deliveryTypesById.get(key);
    if (!item) return;

    const next = { ...item, ...patch };
    deliveryTypesById.set(key, next);

    const idx = deliveryTypesAll.findIndex(x => String(x.id) === key);
    if (idx >= 0) deliveryTypesAll[idx] = next;
}

// ---------- Table ----------
function renderTable(rows) {
    const tbody = document.getElementById("delivery-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    const canManage = canManageDeliveryTypes();
    const frag = document.createDocumentFragment();

    rows.forEach(item => {
        const tr = document.createElement("tr");
        if (!isOn(item.is_active)) tr.classList.add("row-inactive");

        const actions = canManage
            ? (
                isOn(item.is_active)
                    ? `
                        <div class="edit-icon action-btn act-edit" data-id="${item.id}" title="Update">
                            <i class="ri-edit-2-fill"></i>
                        </div>
                        <div class="disable-icon action-btn act-disable" data-id="${item.id}" title="Disable">
                            <i class="ri-prohibited-2-line"></i>
                        </div>
                    `
                    : `
                        <div class="edit-icon action-btn act-edit" data-id="${item.id}" title="Update">
                            <i class="ri-edit-2-fill"></i>
                        </div>
                        <div class="enable-icon action-btn act-enable" data-id="${item.id}" title="Enable">
                            <i class="ri-loop-left-line"></i>
                        </div>
                    `
            )
            : `<span style="color: var(--muted); font-size: 12px;">No actions</span>`;

        tr.innerHTML = `
            <td>${item.id}</td>
            <td class="name-cell" title="${item.name || ""}">${item.name || "-"}</td>
            <td><span class="code-badge">${item.code || "-"}</span></td>
            <td class="fee-cell">${money(item.fee)}</td>
            <td class="status-cell ${isOn(item.is_active) ? "active" : "inactive"}">
                ${isOn(item.is_active) ? "Active" : "Inactive"}
            </td>
            <td class="action-icon">${actions}</td>
        `;

        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
}

function render() {
    const filtered = getFiltered();
    renderTable(filtered);
}

// ---------- Create modal ----------
const createOverlay = document.getElementById("createModal");

function showCreateError(msg) {
    const box = document.getElementById("createError");
    if (!box) return;
    box.textContent = msg;
    box.style.display = "block";
    scrollModalToTop(createOverlay);
}

function clearCreateError() {
    const box = document.getElementById("createError");
    if (!box) return;
    box.textContent = "";
    box.style.display = "none";
}

function resetCreateModal() {
    clearCreateError();
    document.getElementById("delivery-name").value = "";
    document.getElementById("delivery-code").value = "";
    document.getElementById("delivery-fee").value = "";

    const modal = createOverlay?.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

window.openCreateDeliveryModal = function () {
    if (!canManageDeliveryTypes()) return showToast("No permission", "error");
    resetCreateModal();
    createOverlay.classList.add("active");
};

window.closeCreateDeliveryModal = function () {
    createOverlay.classList.remove("active");
    const modal = createOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
};

createOverlay?.addEventListener("click", (e) => {
    if (e.target === createOverlay) closeCreateDeliveryModal();
});

document.getElementById("delivery-code")?.addEventListener("input", function () {
    this.value = normalizeCode(this.value);
});

window.confirmCreateDelivery = function (e) {
    if (e) e.preventDefault();
    if (!canManageDeliveryTypes()) return showToast("No permission", "error");

    clearCreateError();

    const name = document.getElementById("delivery-name").value.trim();
    const code = normalizeCode(document.getElementById("delivery-code").value);
    const fee = Number(document.getElementById("delivery-fee").value);

    if (!name) return showCreateError("Name is required.");
    if (!code) return showCreateError("Code is required.");
    if (!Number.isFinite(fee) || fee < 0) return showCreateError("Invalid fee.");

    openConfirm({
        title: "Create Delivery Type",
        message: "Create this delivery type?",
        type: "createConfirm",
        onConfirm: createDeliveryType
    });
};

async function createDeliveryType() {
    try {
        const json = await apiFetch("/api/delivery-types", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: document.getElementById("delivery-name").value.trim(),
                code: normalizeCode(document.getElementById("delivery-code").value),
                fee: document.getElementById("delivery-fee").value,
                is_active: 1
            })
        });

        closeConfirm();
        closeCreateDeliveryModal();
        await loadDeliveryTypes();
        render();

        showToast("Delivery type created");
        return true;
    } catch (err) {
        showCreateError(err.message || "Create failed");
        showToast("Create failed", "error");
        return false;
    }
}

// ---------- Update modal ----------
const updateOverlay = document.getElementById("updateModal");

function showUpdateError(msg) {
    const box = document.getElementById("updateError");
    if (!box) return;
    box.textContent = msg;
    box.style.display = "block";
    scrollModalToTop(updateOverlay);
}

function clearUpdateError() {
    const box = document.getElementById("updateError");
    if (!box) return;
    box.textContent = "";
    box.style.display = "none";
}

function fillUpdateModal(item) {
    clearUpdateError();
    document.getElementById("update-id").value = item.id;
    document.getElementById("update-delivery-name").value = item.name || "";
    document.getElementById("update-delivery-code").value = item.code || "";
    document.getElementById("update-delivery-fee").value = Number(item.fee || 0).toFixed(2);
}

function openUpdateModal(item) {
    if (!canManageDeliveryTypes()) return showToast("No permission", "error");
    fillUpdateModal(item);
    updateOverlay.classList.add("active");
    const modal = updateOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

window.closeUpdateDeliveryModal = function () {
    updateOverlay.classList.remove("active");
    clearUpdateError();
    const modal = updateOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
};

updateOverlay?.addEventListener("click", (e) => {
    if (e.target === updateOverlay) closeUpdateDeliveryModal();
});

document.getElementById("update-delivery-code")?.addEventListener("input", function () {
    this.value = normalizeCode(this.value);
});

window.confirmUpdateDelivery = function (e) {
    if (e) e.preventDefault();
    if (!canManageDeliveryTypes()) return showToast("No permission", "error");

    clearUpdateError();

    const id = document.getElementById("update-id").value;
    const name = document.getElementById("update-delivery-name").value.trim();
    const code = normalizeCode(document.getElementById("update-delivery-code").value);
    const fee = Number(document.getElementById("update-delivery-fee").value);

    if (!id) return showUpdateError("Missing delivery type id.");
    if (!name) return showUpdateError("Name is required.");
    if (!code) return showUpdateError("Code is required.");
    if (!Number.isFinite(fee) || fee < 0) return showUpdateError("Invalid fee.");

    openConfirm({
        title: "Update Delivery Type",
        message: "Save changes to this delivery type?",
        type: "updateConfirm",
        onConfirm: updateDeliveryType
    });
};

async function updateDeliveryType() {
    const id = document.getElementById("update-id").value;

    try {
        const json = await apiFetch(`/api/delivery-types/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: document.getElementById("update-delivery-name").value.trim(),
                code: normalizeCode(document.getElementById("update-delivery-code").value),
                fee: document.getElementById("update-delivery-fee").value
            })
        });

        if (json?.data) upsertLocalDeliveryType(json.data);

        closeConfirm();
        closeUpdateDeliveryModal();
        await loadDeliveryTypes();
        render();

        showToast("Delivery type updated");
        return true;
    } catch (err) {
        showUpdateError(err.message || "Update failed");
        showToast("Update failed", "error");
        return false;
    }
}

// ---------- Status ----------
async function setStatus(id, on) {
    await apiFetch(`/api/delivery-types/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: on ? 1 : 0 })
    });
}

// ---------- Table events ----------
function wireTableEvents() {
    const tbody = document.getElementById("delivery-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        const id = btn.dataset.id;
        const item = deliveryTypesById.get(String(id));
        if (!item) return showToast("Delivery type not found", "error");

        if (btn.classList.contains("act-edit")) {
            openUpdateModal(item);
            return;
        }

        if (btn.classList.contains("act-disable")) {
            openConfirm({
                title: "Disable Delivery Type",
                message: "Disable this delivery type?",
                type: "disableConfirm",
                onConfirm: async () => {
                    try {
                        await setStatus(id, 0);
                        patchLocalDeliveryType(id, { is_active: 0 });
                        closeConfirm();
                        render();
                        showToast("Delivery type disabled", "warning");
                        return true;
                    } catch (err) {
                        showToast(err.message || "Failed", "error");
                        return false;
                    }
                }
            });
            return;
        }

        if (btn.classList.contains("act-enable")) {
            openConfirm({
                title: "Enable Delivery Type",
                message: "Enable this delivery type?",
                type: "enableConfirm",
                onConfirm: async () => {
                    try {
                        await setStatus(id, 1);
                        patchLocalDeliveryType(id, { is_active: 1 });
                        closeConfirm();
                        render();
                        showToast("Delivery type enabled", "success");
                        return true;
                    } catch (err) {
                        showToast(err.message || "Failed", "error");
                        return false;
                    }
                }
            });
        }
    });
}

// ---------- Filters ----------
function wireFilters() {
    const search = document.getElementById("deliverySearch");
    const showAll = document.getElementById("showAllDeliveryTypes");

    let t;
    const live = () => {
        clearTimeout(t);
        t = setTimeout(() => {
            render();
        }, 120);
    };

    search?.addEventListener("input", live);
    showAll?.addEventListener("change", render);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
    let admin = null;

    if (window.__AUTH_READY__) {
        admin = await window.__AUTH_READY__;
    } else {
        admin = window.__ADMIN__ || null;
    }

    if (!admin) return;

    const role = String(admin.role || "").toLowerCase();
    const allowed = ["superadmin", "manager"].includes(role);

    if (!allowed) {
        blockNoPermission({
            title: "No permission",
            message: "You don't have permission to access this page."
        });
        return;
    }

    const createBtn = document.getElementById("createDeliveryBtn");
    if (createBtn) createBtn.style.display = "";


    await loadDeliveryTypes();
    wireFilters();
    wireTableEvents();
    render();
});

// ---------- Escape close ----------
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (confirmOverlay?.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (updateOverlay?.classList.contains("active")) {
        closeUpdateDeliveryModal();
        return;
    }

    if (createOverlay?.classList.contains("active")) {
        closeCreateDeliveryModal();
        return;
    }
});