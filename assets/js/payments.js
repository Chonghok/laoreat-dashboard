let paymentsAll = [];
let paymentsById = new Map();

let currentPage = 1;
const pageSize = 12;

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

// ---------- Helpers ----------
function viewerRole() {
    return String(window.__ADMIN__?.role || "").toLowerCase();
}

function canViewPayments() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager";
}

async function waitForAuthReady(timeoutMs = 10000) {
    const start = Date.now();

    while (!window.__AUTH_READY__) {
        if (Date.now() - start > timeoutMs) break;
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (window.__AUTH_READY__) {
        try {
            await window.__AUTH_READY__;
        } catch (_) {}
    }

    return window.__ADMIN__ || null;
}

function money(n, currency = "USD") {
    const num = Number(n ?? 0);
    const symbol = String(currency).toUpperCase() === "USD" ? "$" : `${currency} `;
    return `${symbol}${num.toFixed(2)}`;
}

function formatDate(v) {
    if (!v) return "-";
    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(d);
}

function formatTime(v) {
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
    return `${formatDate(v)} • ${formatTime(v)}`;
}

function getPaymentDateValue(p) {
    const raw = p.paid_at || p.created_at;
    if (!raw) return null;

    const d = new Date(String(raw).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function dateStackHTML(v) {
    if (!v) return `<div class="date-stack"><div class="date-top">-</div><div class="date-bottom">-</div></div>`;
    return `
        <div class="date-stack">
            <div class="date-top">${formatDate(v)}</div>
            <div class="date-bottom">${formatTime(v)}</div>
        </div>
    `;
}

function normalizeText(v) {
    return String(v || "").trim().toLowerCase();
}

function titleCase(v) {
    return String(v || "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

function maskCard(last4) {
    if (!last4) return "•••• •••• •••• ••••";
    return `•••• •••• •••• ${String(last4).slice(-4)}`;
}

function statusClass(v) {
    const s = normalizeText(v);
    if (["pending", "paid", "failed", "refunded", "cancelled"].includes(s)) return s;
    return "pending";
}

function updateSummaryCards(sourceRows = paymentsAll) {
    const paid = sourceRows.filter(p => normalizeText(p.status) === "paid").length;
    const pending = sourceRows.filter(p => normalizeText(p.status) === "pending").length;
    const card = sourceRows.filter(p => normalizeText(p.method) === "card").length;
    const cash = sourceRows.filter(p => normalizeText(p.method) === "cash").length;

    const statPaidCount = document.getElementById("statPaidCount");
    const statPendingCount = document.getElementById("statPendingCount");
    const statCardCount = document.getElementById("statCardCount");
    const statCashCount = document.getElementById("statCashCount");

    if (statPaidCount) statPaidCount.textContent = String(paid);
    if (statPendingCount) statPendingCount.textContent = String(pending);
    if (statCardCount) statCardCount.textContent = String(card);
    if (statCashCount) statCashCount.textContent = String(cash);
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
async function loadPayments() {
    const json = await apiFetch("/api/payments");
    paymentsAll = json.data || [];
    paymentsById = new Map(paymentsAll.map(p => [String(p.id), p]));
    updateSummaryCards(paymentsAll);
}

// ---------- Filters ----------
function getFilteredPayments() {
    const q = normalizeText(document.getElementById("paymentSearch")?.value || "");
    const status = normalizeText(document.getElementById("paymentStatusFilter")?.value || "all");
    const method = normalizeText(document.getElementById("paymentMethodFilter")?.value || "all");
    const fromDate = document.getElementById("paymentDateFrom")?.value || "";
    const toDate = document.getElementById("paymentDateTo")?.value || "";

    let arr = paymentsAll;

    if (status !== "all") {
        arr = arr.filter(p => normalizeText(p.status) === status);
    }

    if (method !== "all") {
        arr = arr.filter(p => normalizeText(p.method) === method);
    }

    if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        arr = arr.filter(p => {
            const d = getPaymentDateValue(p);
            return d && d >= from;
        });
    }

    if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        arr = arr.filter(p => {
            const d = getPaymentDateValue(p);
            return d && d <= to;
        });
    }

    if (q) {
        arr = arr.filter(p => {
            const haystack = [
                p.id,
                p.order_number,
                p.customer_username,
                p.customer_phone,
                p.method,
                p.provider,
                p.status,
                p.card_brand,
                p.card_last4,
                p.stripe_payment_intent_id
            ].map(normalizeText).join(" ");

            return haystack.includes(q);
        });
    }

    return arr;
}

// ---------- Table ----------
function renderTable(rows) {
    const tbody = document.getElementById("payments-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 28px 12px; color: var(--muted); font-weight: 700;">
                    No payments found.
                </td>
            </tr>
        `;
        return;
    }

    const frag = document.createDocumentFragment();

    rows.forEach(p => {
        const tr = document.createElement("tr");
        const paidOrCreated = p.paid_at || p.created_at;

        tr.innerHTML = `
            <td>${p.id ?? "-"}</td>

            <td class="order-cell">
                <div class="order-main">${p.order_number || "-"}</div>
                <div class="order-sub">${titleCase(p.order_status || "-")}</div>
            </td>

            <td class="customer-cell">
                <div class="customer-main">${p.customer_username || "-"}</div>
                <div class="customer-sub">${p.customer_phone || "-"}</div>
            </td>

            <td>
                <span class="method-badge ${normalizeText(p.method)}">
                    ${titleCase(p.method || "-")}
                </span>
            </td>

            <td class="amount-cell">${money(p.amount, p.currency)}</td>

            <td>
                <span class="status-badge ${statusClass(p.status)}">
                    ${titleCase(p.status || "-")}
                </span>
            </td>

            <td>${dateStackHTML(paidOrCreated)}</td>

            <td>
                <div class="action-icon">
                    <div class="view-icon action-btn act-view" data-id="${p.id}" title="View">
                        <i class="ri-list-check"></i>
                    </div>
                </div>
            </td>
        `;

        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
}

function renderPagination(total) {
    const holder = document.getElementById("paymentsPagination");
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

function render() {
    const filtered = getFilteredPayments();
    updateSummaryCards(filtered);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    renderTable(pageItems);
    renderPagination(total);
}

// ---------- View Modal ----------
const viewOverlay = document.getElementById("viewModal");

function closeViewModalSafe() {
    viewOverlay?.classList.remove("active");
    const modal = viewOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
}

window.closeViewModal = closeViewModalSafe;

viewOverlay?.addEventListener("click", (e) => {
    if (e.target === viewOverlay) closeViewModalSafe();
});

function setCardBrandVisual(brand) {
    const el = document.getElementById("cardBrandIcon");
    if (!el) return;

    const b = normalizeText(brand);

    if (b.includes("master")) {
        el.innerHTML = `<div class="brand-mastercard" aria-label="Mastercard"></div>`;
        return;
    }

    if (b.includes("visa")) {
        el.innerHTML = `<div class="brand-visa" aria-label="Visa">VISA</div>`;
        return;
    }

    if (b.includes("amex") || b.includes("american express")) {
        el.innerHTML = `<div class="brand-amex">AMEX</div>`;
        return;
    }

    if (b.includes("discover")) {
        el.innerHTML = `<div class="brand-discover">DISC</div>`;
        return;
    }

    if (b.includes("jcb")) {
        el.innerHTML = `<div class="brand-jcb">JCB</div>`;
        return;
    }

    if (b.includes("unionpay")) {
        el.innerHTML = `<div class="brand-unionpay">UP</div>`;
        return;
    }

    el.innerHTML = `<div class="brand-generic"><i class="ri-bank-card-line"></i></div>`;
}

function fillViewModal(p) {
    document.getElementById("view-payment-id").textContent = p.id ?? "-";
    document.getElementById("view-order-number").textContent = p.order_number || "-";
    document.getElementById("view-order-number-box").textContent = p.order_number || "-";
    document.getElementById("view-order-status").textContent = titleCase(p.order_status || "-");

    document.getElementById("view-customer-name").textContent = p.customer_username || "-";
    document.getElementById("view-customer-phone").textContent = p.customer_phone || "-";

    document.getElementById("view-method").textContent = titleCase(p.method || "-");
    document.getElementById("view-amount").textContent = money(p.amount, p.currency);
    document.getElementById("view-currency").textContent = String(p.currency || "-").toUpperCase();
    document.getElementById("view-provider").textContent = titleCase(p.provider || "-");
    document.getElementById("view-provider-text").textContent = titleCase(p.provider || "-");
    document.getElementById("view-paid-at").textContent = formatDateTime(p.paid_at);
    document.getElementById("view-created-at").textContent = formatDateTime(p.created_at);
    document.getElementById("view-stripe-intent").textContent = p.stripe_payment_intent_id || "-";

    const status = document.getElementById("view-status-badge");
    status.textContent = titleCase(p.status || "-");
    status.className = `status-badge ${statusClass(p.status)}`;

    const isCard = normalizeText(p.method) === "card";
    const cardDisplay = document.getElementById("cardDisplay");
    const stripeSection = document.getElementById("stripeSection");

    if (isCard) {
        cardDisplay.style.display = "flex";
        setCardBrandVisual(p.card_brand);
        document.getElementById("view-card-brand").textContent = titleCase(p.card_brand || "Card");
        document.getElementById("view-card-number").textContent = maskCard(p.card_last4);
    } else {
        cardDisplay.style.display = "flex";
        setCardBrandVisual("");
        document.getElementById("view-card-brand").textContent = "Cash Payment";
        document.getElementById("view-card-number").textContent = titleCase(p.provider || "Cash");
    }

    if (p.stripe_payment_intent_id) {
        stripeSection.style.display = "";
    } else {
        stripeSection.style.display = "none";
    }
}

function openViewModal(payment) {
    fillViewModal(payment);
    viewOverlay.classList.add("active");
    const modal = viewOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

// ---------- Events ----------
function wireTableEvents() {
    const tbody = document.getElementById("payments-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        if (btn.classList.contains("act-view")) {
            const id = btn.dataset.id;
            const payment = paymentsById.get(String(id));
            if (!payment) return showToast("Payment not found", "error");
            openViewModal(payment);
        }
    });
}

function wireFilters() {
    const search = document.getElementById("paymentSearch");
    const status = document.getElementById("paymentStatusFilter");
    const method = document.getElementById("paymentMethodFilter");
    const fromDate = document.getElementById("paymentDateFrom");
    const toDate = document.getElementById("paymentDateTo");

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
    method?.addEventListener("change", () => { currentPage = 1; render(); });
    fromDate?.addEventListener("change", () => { currentPage = 1; render(); });
    toDate?.addEventListener("change", () => { currentPage = 1; render(); });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
    const admin = await waitForAuthReady();

    if (!admin) return;

    if (!canViewPayments()) {
        if (typeof blockNoPermission === "function") {
            blockNoPermission({
                title: "No permission",
                message: "You don't have permission to access this page."
            });
        }
        return;
    }

    try {
        await loadPayments();
        wireFilters();
        wireTableEvents();
        render();
    } catch (err) {
        showToast(err.message || "Failed to load payments", "error");
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (viewOverlay?.classList.contains("active")) {
        closeViewModalSafe();
    }
});