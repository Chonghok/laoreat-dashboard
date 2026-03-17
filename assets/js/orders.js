let ordersAll = [];
let ordersById = new Map();

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

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

// ---------- Confirm ----------
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

function canUpdateOrders() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager" || r === "operator";
}

function money(n) {
    const num = Number(n ?? 0);
    return `$${num.toFixed(2)}`;
}

function formatDateOnly(v) {
    if (!v) return "-";
    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(d);
}

function formatTimeOnly(v) {
    if (!v) return "-";
    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return "-";

    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(d).toLowerCase();
}

function formatDateTime(v) {
    if (!v) return "-";
    return `${formatDateOnly(v)} • ${formatTimeOnly(v)}`;
}

function getOrderDateValue(order) {
    const raw = order.created_at;
    if (!raw) return null;

    const d = new Date(String(raw).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function statusLabel(status) {
    const map = {
        accepted: "Accepted",
        preparing: "Preparing",
        on_the_way: "On The Way",
        delivered: "Delivered",
        ready_for_pickup: "Ready For Pickup",
        picked_up: "Picked Up",
    };
    return map[String(status || "").toLowerCase()] || String(status || "-");
}

function deliveryTypeLabel(code, name) {
    if (name && String(name).trim() !== "") return String(name).trim();

    const c = String(code || "").toUpperCase();
    if (c === "PICKUP") return "Pick up";
    if (c === "SCHEDULED") return "Scheduled Delivery";
    if (c === "DELIVERY") return "Delivery";
    return "-";
}

function paymentLabel(method) {
    const m = String(method || "").toLowerCase();
    return m === "card" ? "Card" : m === "cash" ? "Cash" : (method || "-");
}

function isTerminalStatus(order) {
    const code = String(order.delivery_type_code || "").toUpperCase();
    const status = String(order.status || "").toLowerCase();

    if (code === "PICKUP") return status === "picked_up";
    return status === "delivered";
}

function getAllowedStatuses(orderOrCode, maybeStatus = null) {
    const code = typeof orderOrCode === "object"
        ? String(orderOrCode.delivery_type_code || "").toUpperCase()
        : String(orderOrCode || "").toUpperCase();

    const currentStatus = typeof orderOrCode === "object"
        ? String(orderOrCode.status || "").toLowerCase()
        : String(maybeStatus || "").toLowerCase();

    const flow = code === "PICKUP"
        ? ["accepted", "preparing", "ready_for_pickup", "picked_up"]
        : ["accepted", "preparing", "on_the_way", "delivered"];

    const currentIndex = flow.indexOf(currentStatus);
    if (currentIndex === -1) return flow;

    return flow.slice(currentIndex + 1);
}

function scrollModalToTop(overlayEl) {
    const modal = overlayEl?.querySelector(".modal");
    if (modal) modal.scrollTo({ top: 0, behavior: "smooth" });
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

// ---------- Data ----------
async function loadOrders() {
    const json = await apiFetch("/api/admin/orders");
    ordersAll = json.orders || [];
    ordersById = new Map(ordersAll.map(o => [String(o.id), o]));
}

function upsertLocalOrder(order) {
    const key = String(order.id);
    const idx = ordersAll.findIndex(x => String(x.id) === key);

    if (idx >= 0) {
        ordersAll[idx] = { ...ordersAll[idx], ...order };
    } else {
        ordersAll.push(order);
    }

    ordersAll.sort((a, b) => Number(b.id) - Number(a.id));
    ordersById = new Map(ordersAll.map(x => [String(x.id), x]));
}

// ---------- Filter ----------
function getFilteredOrders() {
    const q = (document.getElementById("orderSearch")?.value || "").trim().toLowerCase();
    const status = document.getElementById("statusFilter")?.value || "all";
    const deliveryType = document.getElementById("deliveryTypeFilter")?.value || "all";
    const payment = document.getElementById("paymentFilter")?.value || "all";
    const fromDate = document.getElementById("orderDateFrom")?.value || "";
    const toDate = document.getElementById("orderDateTo")?.value || "";

    let arr = [...ordersAll];

    if (status !== "all") {
        arr = arr.filter(o => String(o.status || "").toLowerCase() === status);
    }

    if (deliveryType !== "all") {
        arr = arr.filter(o => String(o.delivery_type_code || "").toUpperCase() === deliveryType);
    }

    if (payment !== "all") {
        arr = arr.filter(o => String(o.payment_method || "").toLowerCase() === payment);
    }

    if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        arr = arr.filter(o => {
            const d = getOrderDateValue(o);
            return d && d >= from;
        });
    }

    if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        arr = arr.filter(o => {
            const d = getOrderDateValue(o);
            return d && d <= to;
        });
    }

    if (q) {
        arr = arr.filter(o => {
            const orderNo = String(o.order_number || "").toLowerCase();
            const contactName = String(o.contact_name || "").toLowerCase();
            const contactPhone = String(o.contact_phone || "").toLowerCase();
            return orderNo.includes(q) || contactName.includes(q) || contactPhone.includes(q);
        });
    }

    return arr;
}

// ---------- Render ----------
function renderPagination(total) {
    const holder = document.getElementById("ordersPagination");
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

function renderTable(rows) {
    const tbody = document.getElementById("ordersTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const isEditor = canUpdateOrders();
    const frag = document.createDocumentFragment();

    rows.forEach(order => {
        const tr = document.createElement("tr");
        const terminal = isTerminalStatus(order);

        const viewBtn = `
            <div class="view-icon action-btn act-view" data-id="${order.id}" title="View">
                <i class="ri-list-check"></i>
            </div>
        `;

        const updateBtn = isEditor
            ? `
                <div class="edit-icon action-btn act-update ${terminal ? "disabled" : ""}" data-id="${order.id}" title="${terminal ? "Completed order" : "Update Status"}">
                    <i class="ri-edit-2-fill"></i>
                </div>
            `
            : "";

        tr.innerHTML = `
            <td class="order-number-cell">${order.order_number || "-"}</td>
            <td class="customer-cell">
                <div class="customer-name">${order.contact_name || "-"}</div>
                <div class="customer-phone">${order.contact_phone || "-"}</div>
            </td>
            <td><span class="badge type">${deliveryTypeLabel(order.delivery_type_code, order.delivery_type_name)}</span></td>
            <td class="money-cell">${money(order.total_amount)}</td>
            <td><span class="badge payment ${String(order.payment_method || "").toLowerCase()}">${paymentLabel(order.payment_method)}</span></td>
            <td><span class="badge status ${String(order.status || "").toLowerCase()}">${statusLabel(order.status)}</span></td>
            <td class="date-cell">
                <span class="date-main">${formatDateOnly(order.created_at)}</span>
                <span class="date-sub">${formatTimeOnly(order.created_at)}</span>
            </td>
            <td class="action-icon">${viewBtn}${updateBtn}</td>
        `;

        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
}

function render() {
    const filtered = getFilteredOrders();
    const total = filtered.length;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    renderTable(rows);
    renderPagination(total);
}

// ---------- View Modal ----------
const viewOverlay = document.getElementById("viewOrderModal");

function closeViewOrderModalSafe() {
    viewOverlay.classList.remove("active");
    const modal = viewOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
}

window.closeViewOrderModal = closeViewOrderModalSafe;

viewOverlay?.addEventListener("click", (e) => {
    if (e.target === viewOverlay) closeViewOrderModalSafe();
});

function fillViewModal(order) {
    document.getElementById("viewOrderNumber").textContent = order.order_number || "-";
    document.getElementById("viewCreatedAt").textContent = formatDateTime(order.created_at);
    document.getElementById("viewUpdatedAt").textContent = formatDateTime(order.updated_at);

    const typeBadge = document.getElementById("viewDeliveryType");
    typeBadge.textContent = deliveryTypeLabel(order.delivery_type_code, order.delivery_type_name);

    const paymentBadge = document.getElementById("viewPaymentMethod");
    paymentBadge.textContent = paymentLabel(order.payment_method);
    paymentBadge.className = `obadge payment ${String(order.payment_method || "").toLowerCase()}`;

    const statusBadge = document.getElementById("viewStatusBadge");
    statusBadge.textContent = statusLabel(order.status);
    statusBadge.className = `obadge status ${String(order.status || "").toLowerCase()}`;

    document.getElementById("viewContactName").textContent = order.contact_name || "-";
    document.getElementById("viewContactPhone").textContent = order.contact_phone || "-";
    document.getElementById("viewCustomerEmail").textContent = order.customer_email || "-";

    document.getElementById("viewDeliveryName").textContent = deliveryTypeLabel(order.delivery_type_code, order.delivery_type_name);
    document.getElementById("viewScheduledFor").textContent = formatDateTime(order.scheduled_for);
    document.getElementById("viewAddress").textContent = order.delivery_address || "-";
    document.getElementById("viewNoteForRider").textContent = order.note_for_rider || "-";

    document.getElementById("viewPaymentMethodText").textContent = paymentLabel(order.payment_method);
    document.getElementById("viewPaymentProvider").textContent = order.payment_provider || "-";
    document.getElementById("viewPaymentStatus").textContent = order.payment_status || "-";
    document.getElementById("viewPaidAt").textContent = formatDateTime(order.paid_at);

    document.getElementById("viewSubtotal").textContent = money(order.subtotal);
    document.getElementById("viewDiscount").textContent = `- ${money(order.discount_amount)}`;
    document.getElementById("viewDeliveryFee").textContent = money(order.delivery_fee);
    document.getElementById("viewTotalAmount").textContent = money(order.total_amount);

    const itemsBody = document.getElementById("viewItemsBody");
    itemsBody.innerHTML = "";

    (order.items || []).forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.product_name || "-"}</td>
            <td>${Number(item.quantity || 0)}</td>
            <td>${money(item.unit_price)}</td>
            <td>${item.discount_percent ? `${Number(item.discount_percent)}%` : "-"}</td>
            <td>${money(item.final_unit_price)}</td>
            <td>${money(item.line_total)}</td>
        `;
        itemsBody.appendChild(tr);
    });

    viewOverlay.classList.add("active");
    const modal = viewOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

// ---------- Update Modal ----------
const updateOverlay = document.getElementById("updateStatusModal");

function showUpdateError(msg) {
    const box = document.getElementById("updateStatusError");
    if (!box) return;
    box.textContent = msg;
    box.style.display = "block";
    scrollModalToTop(updateOverlay);
}

function clearUpdateError() {
    const box = document.getElementById("updateStatusError");
    if (!box) return;
    box.textContent = "";
    box.style.display = "none";
}

function closeUpdateStatusModalSafe() {
    updateOverlay.classList.remove("active");
    clearUpdateError();
    const modal = updateOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
}

window.closeUpdateStatusModal = closeUpdateStatusModalSafe;

updateOverlay?.addEventListener("click", (e) => {
    if (e.target === updateOverlay) closeUpdateStatusModalSafe();
});

function openUpdateStatusModal(order) {
    if (!canUpdateOrders()) return showToast("No permission", "error");
    if (isTerminalStatus(order)) return showToast("Completed order cannot be updated", "warning");

    clearUpdateError();

    document.getElementById("updateOrderId").value = order.id;
    document.getElementById("updateOrderTypeCode").value = order.delivery_type_code || "";
    document.getElementById("updateCurrentStatus").value = order.status || "";

    document.getElementById("updateOrderNumber").textContent = order.order_number || "-";
    document.getElementById("updateDeliveryTypeName").textContent = deliveryTypeLabel(order.delivery_type_code, order.delivery_type_name);
    document.getElementById("updateCurrentStatusText").textContent = statusLabel(order.status);

    const select = document.getElementById("updateOrderStatus");
    const nextStatuses = getAllowedStatuses(order);

    select.innerHTML = `<option value="">Select next status</option>`;
    nextStatuses.forEach(status => {
        const opt = document.createElement("option");
        opt.value = status;
        opt.textContent = statusLabel(status);
        select.appendChild(opt);
    });

    updateOverlay.classList.add("active");
    const modal = updateOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

window.confirmUpdateOrderStatus = function (e) {
    if (e) e.preventDefault();
    if (!canUpdateOrders()) return showToast("No permission", "error");

    clearUpdateError();

    const id = document.getElementById("updateOrderId").value;
    const newStatus = document.getElementById("updateOrderStatus").value;
    const currentStatus = document.getElementById("updateCurrentStatus").value;
    const typeCode = document.getElementById("updateOrderTypeCode").value;

    if (!id) return showUpdateError("Missing order id.");
    if (!newStatus) return showUpdateError("Please select a new status.");

    const allowed = getAllowedStatuses(typeCode, currentStatus);
    if (!allowed.includes(newStatus)) {
        return showUpdateError("Invalid next status.");
    }

    openConfirm({
        title: "Update Order Status",
        message: `Change order status to "${statusLabel(newStatus)}"?`,
        type: "updateConfirm",
        onConfirm: updateOrderStatus
    });
};

async function updateOrderStatus() {
    const id = document.getElementById("updateOrderId").value;
    const status = document.getElementById("updateOrderStatus").value;

    try {
        const json = await apiFetch(`/api/admin/orders/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });

        if (json.order) upsertLocalOrder(json.order);
        else await loadOrders();

        closeConfirm();
        closeUpdateStatusModalSafe();
        render();
        showToast("Order status updated");
        return true;
    } catch (err) {
        showUpdateError(err.message || "Update failed");
        showToast("Update failed", "error");
        return false;
    }
}

// ---------- Events ----------
function wireTableEvents() {
    const tbody = document.getElementById("ordersTableBody");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn || btn.classList.contains("disabled")) return;

        const id = btn.dataset.id;
        const order = ordersById.get(String(id));
        if (!order) return showToast("Order not found", "error");

        if (btn.classList.contains("act-view")) {
            fillViewModal(order);
            return;
        }

        if (btn.classList.contains("act-update")) {
            openUpdateStatusModal(order);
        }
    });
}

function wireFilters() {
    const search = document.getElementById("orderSearch");
    const status = document.getElementById("statusFilter");
    const deliveryType = document.getElementById("deliveryTypeFilter");
    const payment = document.getElementById("paymentFilter");
    const fromDate = document.getElementById("orderDateFrom");
    const toDate = document.getElementById("orderDateTo");

    let t;
    const live = () => {
        clearTimeout(t);
        t = setTimeout(() => {
            currentPage = 1;
            render();
        }, 120);
    };

    search?.addEventListener("input", live);
    status?.addEventListener("change", () => { currentPage = 1; render(); });
    deliveryType?.addEventListener("change", () => { currentPage = 1; render(); });
    payment?.addEventListener("change", () => { currentPage = 1; render(); });
    fromDate?.addEventListener("change", () => { currentPage = 1; render(); });
    toDate?.addEventListener("change", () => { currentPage = 1; render(); });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
    if (window.__AUTH_READY__) await window.__AUTH_READY__;

    const admin = window.__ADMIN__;
    if (!admin) return;

    if (!requireRole(admin, ["superadmin", "manager", "operator"])) return;

    await loadOrders();
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

    if (updateOverlay?.classList.contains("active")) {
        closeUpdateStatusModalSafe();
        return;
    }

    if (viewOverlay?.classList.contains("active")) {
        closeViewOrderModalSafe();
    }
});