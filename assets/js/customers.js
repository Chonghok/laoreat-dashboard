let customersAll = [];
let customersById = new Map();

let currentPage = 1;
const pageSize = 15;

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

// ---------- Confirm ----------
const confirmOverlay = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelConfirm");
let confirmAction = null;

function openConfirm({ title, message, type = "disableConfirm", onConfirm }) {
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
function formatDateTime(v) {
    if (!v) return "-";

    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);

    const datePart = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(d);

    const timePart = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(d).toLowerCase();

    return `${datePart} • ${timePart}`;
}

function viewerRole() {
    return String(window.__ADMIN__?.role || "").toLowerCase();
}

function canManageCustomers() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager";
}

function isOn(v) {
    return Number(v) === 1 || v === true || v === "1";
}

function isVerified(customer) {
    return !!customer.phone_verified_at;
}

function money(n) {
    const num = Number(n ?? 0);
    return `$${num.toFixed(2)}`;
}

function closeViewModalSafe() {
    viewOverlay.classList.remove("active");
    const modal = viewOverlay?.querySelector(".modal");
    if (modal) {
        setTimeout(() => {
            modal.scrollTop = 0;
        }, 260);
    }
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
async function loadCustomers() {
    const json = await apiFetch("/api/customers");
    customersAll = json.data || [];
    customersById = new Map(customersAll.map(c => [String(c.id), c]));
}

function patchLocalCustomer(id, patch) {
    const key = String(id);
    const c = customersById.get(key);
    if (!c) return;

    const next = { ...c, ...patch };
    customersById.set(key, next);

    const idx = customersAll.findIndex(x => String(x.id) === key);
    if (idx >= 0) customersAll[idx] = next;
}

// ---------- Filter ----------
function getFiltered() {
    const q = (document.getElementById("customerSearch")?.value || "").trim().toLowerCase();
    const showAll = !!document.getElementById("showAllCustomers")?.checked;
    const verified = document.getElementById("verifiedFilter")?.value || "all";
    const status = document.getElementById("statusFilter")?.value || "all";

    let arr = customersAll;

    if (!showAll) arr = arr.filter(c => isOn(c.is_active));
    if (verified === "verified") arr = arr.filter(c => isVerified(c));
    if (verified === "unverified") arr = arr.filter(c => !isVerified(c));
    if (status === "active") arr = arr.filter(c => isOn(c.is_active));
    if (status === "inactive") arr = arr.filter(c => !isOn(c.is_active));

    if (q) {
        arr = arr.filter(c => {
            const idStr = String(c.id || "");
            const username = String(c.username || "").toLowerCase();
            const email = String(c.email || "").toLowerCase();
            const phone = String(c.phone_number || "").toLowerCase();

            return idStr.includes(q) ||
                username.includes(q) ||
                email.includes(q) ||
                phone.includes(q);
        });
    }

    return arr;
}

// ---------- Pagination ----------
function renderPagination(total) {
    const holder = document.getElementById("customersPagination");
    if (!holder) return;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(currentPage, totalPages);

    holder.innerHTML = "";

    const btn = (label, page, disabled = false, active = false) => {
        const b = document.createElement("button");
        b.className = "page-btn" + (active ? " active" : "");
        b.textContent = label;
        b.disabled = disabled;
        b.addEventListener("click", () => {
            currentPage = page;
            render();
        });
        return b;
    };

    holder.appendChild(btn("Prev", Math.max(1, currentPage - 1), currentPage === 1));

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);

    for (let p = start; p <= end; p++) {
        holder.appendChild(btn(String(p), p, false, p === currentPage));
    }

    holder.appendChild(btn("Next", Math.min(totalPages, currentPage + 1), currentPage === totalPages));

    const info = document.createElement("span");
    info.className = "page-info";
    info.textContent = `Page ${currentPage}/${totalPages}`;
    holder.appendChild(info);
}

// ---------- Render ----------
function renderTable(rows) {
    const tbody = document.getElementById("customer-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    const canManage = canManageCustomers();
    const frag = document.createDocumentFragment();

    rows.forEach(c => {
        const tr = document.createElement("tr");
        if (!isOn(c.is_active)) tr.classList.add("row-inactive");

        const verifiedBadge = isVerified(c)
            ? `<span class="badge verified">Verified</span>`
            : `<span class="badge unverified">Unverified</span>`;

        const actions = (() => {
            const view = `<div class="view-icon action-btn act-view" data-id="${c.id}" title="View"><i class="ri-list-check"></i></div>`;
            if (!canManage) return view;

            const toggle = isOn(c.is_active)
                ? `<div class="disable-icon action-btn act-disable" data-id="${c.id}" title="Disable"><i class="ri-prohibited-2-line"></i></div>`
                : `<div class="enable-icon action-btn act-enable" data-id="${c.id}" title="Enable"><i class="ri-loop-left-line"></i></div>`;

            return view + toggle;
        })();

        tr.innerHTML = `
            <td>${c.id}</td>
            <td><img class="customer-img" src="${c.profile_url || "assets/images/default-user.webp"}" alt="Customer"></td>
            <td class="username-cell" title="${c.username || ""}">${c.username || "-"}</td>
            <td class="email-cell" title="${c.email || ""}">${c.email || "-"}</td>
            <td>${verifiedBadge}</td>
            <td class="order-count-cell">${Number(c.orders_count || 0)}</td>
            <td class="status-cell ${isOn(c.is_active) ? "active" : "inactive"}">${isOn(c.is_active) ? "Active" : "Disabled"}</td>
            <td class="action-icon">${actions}</td>
        `;

        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
}

function render() {
    const filtered = getFiltered();
    const total = filtered.length;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    renderTable(pageItems);
    renderPagination(total);
}

// ---------- View ----------
const viewOverlay = document.getElementById("viewModal");
window.closeViewModal = closeViewModalSafe;

viewOverlay?.addEventListener("click", (e) => {
    if (e.target === viewOverlay) closeViewModal();
});

function fillViewModal(c) {
    document.getElementById("view-username").textContent = c.username || "-";
    document.getElementById("view-id").textContent = c.id ?? "-";
    document.getElementById("view-email").textContent = c.email || "-";
    document.getElementById("view-phone").textContent = c.phone_number || "-";

    document.getElementById("view-total-orders").textContent = Number(c.orders_count || 0);
    document.getElementById("view-total-spent").textContent = money(c.total_spent || 0);
    document.getElementById("view-last-order-date").textContent = formatDateTime(c.last_order_at);
    document.getElementById("view-created-at").textContent = formatDateTime(c.created_at);
    document.getElementById("view-created-at-2").textContent = formatDateTime(c.created_at);
    document.getElementById("view-updated-at").textContent = formatDateTime(c.updated_at);

    const verifiedEl = document.getElementById("view-verified-badge");
    const verified = isVerified(c);
    verifiedEl.textContent = verified ? "Verified" : "Unverified";
    verifiedEl.className = `cbadge verified ${verified ? "on" : "off"}`;

    const statusEl = document.getElementById("view-status-badge");
    const active = isOn(c.is_active);
    statusEl.textContent = active ? "Active" : "Disabled";
    statusEl.className = `cbadge status ${active ? "active" : "inactive"}`;

    const img = document.getElementById("viewProfilePreview");
    img.innerHTML = c.profile_url
        ? `<img src="${c.profile_url}" alt="Customer">`
        : `<i class="ri-user-3-line"></i>`;
}

function openViewModal(id) {
    const customer = customersById.get(String(id));
    if (!customer) {
        showToast("Customer not found", "error");
        return;
    }

    fillViewModal(customer);
    viewOverlay.classList.add("active");

    const modal = viewOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

// ---------- Status ----------
async function setStatus(id, on) {
    await apiFetch(`/api/customers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: on ? 1 : 0 })
    });
}

// ---------- Events ----------
function wireTableEvents() {
    const tbody = document.getElementById("customer-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        const id = btn.dataset.id;
        const customer = customersById.get(String(id));
        if (!customer) return showToast("Customer not found", "error");

        if (btn.classList.contains("act-view")) {
            openViewModal(id);
            return;
        }

        if (btn.classList.contains("act-disable")) {
            openConfirm({
                title: "Disable Customer",
                message: "Disable this customer account?",
                type: "disableConfirm",
                onConfirm: async () => {
                    try {
                        await setStatus(id, 0);
                        patchLocalCustomer(id, { is_active: 0 });
                        closeConfirm();
                        render();
                        showToast("Customer disabled", "warning");
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
                title: "Enable Customer",
                message: "Enable this customer account?",
                type: "enableConfirm",
                onConfirm: async () => {
                    try {
                        await setStatus(id, 1);
                        patchLocalCustomer(id, { is_active: 1 });
                        closeConfirm();
                        render();
                        showToast("Customer enabled", "success");
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

function wireFilters() {
    const search = document.getElementById("customerSearch");
    const showAll = document.getElementById("showAllCustomers");
    const verified = document.getElementById("verifiedFilter");
    const status = document.getElementById("statusFilter");

    let t;
    const live = () => {
        clearTimeout(t);
        t = setTimeout(() => {
            currentPage = 1;
            render();
        }, 120);
    };

    search?.addEventListener("input", live);
    showAll?.addEventListener("change", () => { currentPage = 1; render(); });
    verified?.addEventListener("change", () => { currentPage = 1; render(); });
    status?.addEventListener("change", () => { currentPage = 1; render(); });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
    if (window.__AUTH_READY__) await window.__AUTH_READY__;

    const admin = window.__ADMIN__;
    if (!admin) return;

    if (!requireRole(admin, ["superadmin", "manager", "operator"])) return;

    await loadCustomers();
    wireFilters();
    wireTableEvents();
    render();
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (confirmOverlay?.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (viewOverlay?.classList.contains("active")) {
        closeViewModalSafe();
    }
});