let promotionsMaster = [];
let promotionsFiltered = [];
let promotionsById = new Map();

let currentPage = 1;
const pageSize = 10;
let toastTimer;

// ---------- Helpers ----------
function authHeaders(extra = {}) {
    const token = getToken();
    return {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...extra
    };
}

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("active");

    const modal = el.querySelector(".modal, .confirm-modal");
    if (modal) modal.scrollTop = 0;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove("active");

    const modal = el.querySelector(".modal, .confirm-modal");
    if (modal) {
        setTimeout(() => {
            modal.scrollTop = 0;
        }, 450);
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal-overlay.active, .confirm-overlay.active").forEach(el => {
        if (el.id) {
            closeModal(el.id);
        }
    });
}

function scrollModalToTop(overlayId, behavior = "smooth") {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;

    const modal = overlay.querySelector(".modal, .confirm-modal");
    if (!modal) return;

    modal.scrollTo({
        top: 0,
        behavior
    });
}

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function showFormError(id, message, overlayId = null) {
    const box = document.getElementById(id);
    if (!box) return;

    box.style.display = "block";
    box.textContent = message;

    if (overlayId) {
        scrollModalToTop(overlayId, "smooth");
    }
}

function clearFormError(id) {
    const box = document.getElementById(id);
    if (!box) return;
    box.style.display = "none";
    box.textContent = "";
}

function extractErrorMessage(errJson, fallback = "Something went wrong.") {
    if (!errJson) return fallback;
    if (errJson.message) return errJson.message;

    if (errJson.errors) {
        const firstKey = Object.keys(errJson.errors)[0];
        if (firstKey && errJson.errors[firstKey]?.length) {
            return errJson.errors[firstKey][0];
        }
    }

    return fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatPercent(value) {
    return Number(value).toFixed(2).replace(/\.00$/, "");
}

function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "No minimum";
    return `$${Number(value).toFixed(2)}`;
}

function formatDateTime(v) {
    if (!v) return "No expiry";

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

function formatDateTimeStack(v) {
    if (!v) {
        return `<span class="expires-date">No expiry</span>`;
    }

    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) {
        return `<span class="expires-date">${escapeHtml(String(v))}</span>`;
    }

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

    return `
        <span class="expires-date">${escapeHtml(datePart)}</span>
        <span class="expires-time">${escapeHtml(timePart)}</span>
    `;
}

function toDateTimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return "";

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function emptyToNull(value) {
    return value === "" || value === null || value === undefined ? null : value;
}

function getCustomerRuleText(promo) {
    if (promo.first_order_only) return "First order only";
    if (promo.min_completed_orders != null) return `Min ${promo.min_completed_orders} completed orders`;
    return "Everyone";
}

function getPromotionStatus(promo) {
    if (!promo.is_active) return "inactive";

    if (promo.expires_at) {
        const now = new Date();
        const expiry = new Date(String(promo.expires_at).replace(" ", "T"));
        if (!Number.isNaN(expiry.getTime()) && expiry < now) {
            return "expired";
        }
    }

    return "active";
}

function getPromotionStatusLabel(promo) {
    const status = getPromotionStatus(promo);
    if (status === "inactive") return "Inactive";
    if (status === "expired") return "Expired";
    return "Active";
}

function getUsageText(promo) {
    return `${promo.used_count ?? 0} / ${promo.max_total_usage ?? "Unlimited"}`;
}

function getRemainingUsage(promo) {
    if (promo.max_total_usage == null) return "Unlimited";
    return Math.max((promo.max_total_usage ?? 0) - (promo.used_count ?? 0), 0);
}

// ---------- Rule logic ----------
function syncCustomerRuleInputs(checkboxId, completedInputId, maxUsageInputId) {
    const checkbox = document.getElementById(checkboxId);
    const completedInput = document.getElementById(completedInputId);
    const maxUsageInput = document.getElementById(maxUsageInputId);

    if (!checkbox || !completedInput || !maxUsageInput) return;

    if (checkbox.checked) {
        completedInput.value = "";
        completedInput.disabled = true;

        maxUsageInput.value = "1";
        maxUsageInput.disabled = true;
    } else {
        completedInput.disabled = false;
        maxUsageInput.disabled = false;
    }
}

function setupCustomerRuleToggle(checkboxId, completedInputId, maxUsageInputId) {
    const checkbox = document.getElementById(checkboxId);
    const completedInput = document.getElementById(completedInputId);

    if (!checkbox || !completedInput) return;

    checkbox.addEventListener("change", () => {
        syncCustomerRuleInputs(checkboxId, completedInputId, maxUsageInputId);
    });

    completedInput.addEventListener("input", () => {
        if (completedInput.value.trim() !== "") {
            checkbox.checked = false;
            syncCustomerRuleInputs(checkboxId, completedInputId, maxUsageInputId);
        }
    });

    syncCustomerRuleInputs(checkboxId, completedInputId, maxUsageInputId);
}

// ---------- Forms ----------
function resetCreateForm() {
    document.getElementById("promo-code").value = "";
    document.getElementById("discount-percent").value = "";
    document.getElementById("min-order-amount").value = "";
    document.getElementById("expires-at").value = "";
    document.getElementById("promo-description").value = "";
    document.getElementById("first-order-only").checked = false;
    document.getElementById("min-completed-orders").value = "";
    document.getElementById("max-usage-per-user").value = "";
    document.getElementById("max-total-usage").value = "";

    syncCustomerRuleInputs("first-order-only", "min-completed-orders", "max-usage-per-user");
    clearFormError("createPromotionError");
}

function getCreatePayload() {
    return {
        code: document.getElementById("promo-code").value.trim(),
        discount_percent: document.getElementById("discount-percent").value.trim(),
        min_amount: emptyToNull(document.getElementById("min-order-amount").value),
        expires_at: emptyToNull(document.getElementById("expires-at").value),
        description: document.getElementById("promo-description").value.trim(),
        first_order_only: document.getElementById("first-order-only").checked ? 1 : 0,
        min_completed_orders: emptyToNull(document.getElementById("min-completed-orders").value),
        max_usage_per_customer: emptyToNull(document.getElementById("max-usage-per-user").value),
        max_total_usage: emptyToNull(document.getElementById("max-total-usage").value),
    };
}

function getUpdatePayload() {
    return {
        code: document.getElementById("update-promo-code").value.trim(),
        discount_percent: document.getElementById("update-discount-percent").value.trim(),
        min_amount: emptyToNull(document.getElementById("update-min-order-amount").value),
        expires_at: emptyToNull(document.getElementById("update-expires-at").value),
        description: document.getElementById("update-promo-description").value.trim(),
        first_order_only: document.getElementById("update-first-order-only").checked ? 1 : 0,
        min_completed_orders: emptyToNull(document.getElementById("update-min-completed-orders").value),
        max_usage_per_customer: emptyToNull(document.getElementById("update-max-usage-per-user").value),
        max_total_usage: emptyToNull(document.getElementById("update-max-total-usage").value),
    };
}

// ---------- API ----------
async function fetchPromotions() {
    const res = await fetch(`${window.API_BASE}/api/promotions?all=1`, {
        headers: authHeaders()
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        throw new Error(extractErrorMessage(json, "Failed to load promotions."));
    }

    promotionsMaster = Array.isArray(json.promotions) ? json.promotions : [];
    promotionsById = new Map(promotionsMaster.map(p => [String(p.id), p]));

    applyLocalFilters();
}

async function fetchPromotionById(id) {
    const res = await fetch(`${window.API_BASE}/api/promotions/${id}`, {
        headers: authHeaders()
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        throw new Error(extractErrorMessage(json, "Failed to load promotion."));
    }

    return json.promotion;
}

// ---------- Local filter/search ----------
function applyLocalFilters() {
    const search = document.getElementById("promotionSearch")?.value.trim().toLowerCase() || "";
    const status = document.getElementById("statusFilter")?.value || "all";
    const rule = document.getElementById("ruleFilter")?.value || "all";
    const showAll = document.getElementById("showAllPromotions")?.checked || false;

    let list = [...promotionsMaster];

    // unchecked = active + expired
    // checked = include inactive too
    if (!showAll) {
        list = list.filter(p => getPromotionStatus(p) !== "inactive");
    }

    if (search) {
        list = list.filter(p =>
            String(p.code || "").toLowerCase().includes(search)
        );
    }

    if (status !== "all") {
        list = list.filter(p => {
            const promoStatus = getPromotionStatus(p);
            if (status === "active") return promoStatus === "active";
            if (status === "expired") return promoStatus === "expired";
            return true;
        });
    }

    if (rule !== "all") {
        list = list.filter(p => {
            if (rule === "everyone") return !p.first_order_only && p.min_completed_orders == null;
            if (rule === "first_order") return !!p.first_order_only;
            if (rule === "loyal") return p.min_completed_orders != null;
            return true;
        });
    }

    promotionsFiltered = list;
    currentPage = 1;
    renderPromotionsTable();
    renderPagination();
}

// ---------- Render ----------
function renderPromotionsTable() {
    const tbody = document.getElementById("promotion-table-body");
    if (!tbody) return;

    if (!promotionsFiltered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding:20px; color:var(--muted);">
                    No promotions found.
                </td>
            </tr>
        `;
        return;
    }

    const start = (currentPage - 1) * pageSize;
    const pageRows = promotionsFiltered.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.map((promo) => {
        const statusClass = getPromotionStatus(promo);
        const statusLabel = getPromotionStatusLabel(promo);

        return `
            <tr class="${!promo.is_active ? "row-inactive" : ""}">
                <td class="code-cell">${escapeHtml(promo.code)}</td>
                <td class="discount-cell">${formatPercent(promo.discount_percent)}%</td>
                <td class="rule-cell" title="${escapeHtml(getCustomerRuleText(promo))}">
                    ${escapeHtml(getCustomerRuleText(promo))}
                </td>
                <td class="usage-cell">${escapeHtml(getUsageText(promo))}</td>
                <td class="expires-cell">${formatDateTimeStack(promo.expires_at)}</td>
                <td class="status-cell ${statusClass}">${statusLabel}</td>
                <td class="action-icon">
                    <div class="view-icon action-btn" data-action="view" data-id="${promo.id}" title="View">
                        <i class="ri-list-check"></i>
                    </div>
                    <div class="edit-icon action-btn" data-action="edit" data-id="${promo.id}" title="Update">
                        <i class="ri-edit-2-fill"></i>
                    </div>
                    ${
                        promo.is_active
                        ? `<div class="disable-icon action-btn" data-action="disable" data-id="${promo.id}" title="Disable">
                                <i class="ri-prohibited-2-line"></i>
                           </div>`
                        : `<div class="enable-icon action-btn" data-action="enable" data-id="${promo.id}" title="Enable">
                                <i class="ri-loop-left-line"></i>
                           </div>`
                    }
                </td>
            </tr>
        `;
    }).join("");
}

function renderPagination() {
    const container = document.getElementById("promotionsPagination");
    if (!container) return;

    const totalPages = Math.ceil(promotionsFiltered.length / pageSize);

    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button class="page-btn" ${currentPage <= 1 ? "disabled" : ""} data-page="${currentPage - 1}">
            Prev
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button class="page-btn ${i === currentPage ? "active" : ""}" data-page="${i}">
                ${i}
            </button>
        `;
    }

    html += `
        <button class="page-btn" ${currentPage >= totalPages ? "disabled" : ""} data-page="${currentPage + 1}">
            Next
        </button>
    `;

    container.innerHTML = html;
}

// ---------- View ----------
async function openViewPromotionModal(id) {
    try {
        const promo = promotionsById.get(String(id)) || await fetchPromotionById(id);

        document.getElementById("view-promo-code").textContent = promo.code;
        document.getElementById("view-discount-percent").textContent = `${formatPercent(promo.discount_percent)}%`;

        const statusEl = document.getElementById("view-status");
        const statusText = getPromotionStatusLabel(promo);
        const statusClass = getPromotionStatus(promo);
        statusEl.textContent = statusText;
        statusEl.className = `promo-badge status ${statusClass}`;

        document.getElementById("view-customer-rule").textContent = getCustomerRuleText(promo);
        document.getElementById("view-id").textContent = promo.id;
        document.getElementById("view-min-spend").textContent = formatMoney(promo.min_amount);
        document.getElementById("view-first-order-only").textContent = promo.first_order_only ? "Yes" : "No";
        document.getElementById("view-min-completed-orders").textContent = promo.min_completed_orders ?? "None";
        document.getElementById("view-max-usage-per-user").textContent = promo.max_usage_per_customer ?? "Unlimited";
        document.getElementById("view-max-total-usage").textContent = promo.max_total_usage ?? "Unlimited";
        document.getElementById("view-used-count").textContent = promo.used_count ?? 0;
        document.getElementById("view-remaining-usage").textContent = getRemainingUsage(promo);
        document.getElementById("view-description").textContent = promo.description || "-";
        document.getElementById("view-description").classList.add("description-text");
        document.getElementById("view-expires-at").textContent = formatDateTime(promo.expires_at);
        document.getElementById("view-is-active").textContent = promo.is_active ? "Yes" : "No";
        document.getElementById("view-created-at").textContent = formatDateTime(promo.created_at);
        document.getElementById("view-updated-at").textContent = formatDateTime(promo.updated_at);

        openModal("viewPromotionModal");
    } catch (err) {
        showToast(err.message || "Failed to load promotion.", "error");
    }
}

function closeViewPromotionModal() {
    closeModal("viewPromotionModal");
}

// ---------- Create ----------
function validateCreatePromotionForm() {
    const code = document.getElementById("promo-code").value.trim();
    const discount = document.getElementById("discount-percent").value.trim();
    const description = document.getElementById("promo-description").value.trim();
    const firstOrderOnly = document.getElementById("first-order-only").checked;
    const minCompletedOrders = document.getElementById("min-completed-orders").value.trim();
    const maxUsagePerCustomer = document.getElementById("max-usage-per-user").value.trim();
    const maxTotalUsage = document.getElementById("max-total-usage").value.trim();

    if (!code) return "Promo code is required.";
    if (!discount) return "Discount percent is required.";

    const discountNum = Number(discount);
    if (Number.isNaN(discountNum) || discountNum <= 0 || discountNum > 100) {
        return "Discount percent must be greater than 0 and not more than 100.";
    }

    if (!description) return "Description is required.";

    if (firstOrderOnly && minCompletedOrders) {
        return "First order only cannot be combined with minimum completed orders.";
    }

    if (minCompletedOrders && Number(minCompletedOrders) < 1) {
        return "Minimum completed orders must be at least 1.";
    }

    if (maxUsagePerCustomer && Number(maxUsagePerCustomer) < 1) {
        return "Max usage per customer must be at least 1.";
    }

    if (maxTotalUsage && Number(maxTotalUsage) < 1) {
        return "Max total usage must be at least 1.";
    }

    return null;
}

function openCreatePromotionModal() {
    resetCreateForm();
    openModal("createPromotionModal");
}

function closeCreatePromotionModal() {
    closeModal("createPromotionModal");
}

function openCreateConfirm(event) {
    event?.preventDefault?.();
    clearFormError("createPromotionError");

    const error = validateCreatePromotionForm();
    if (error) {
        showFormError("createPromotionError", error);
        scrollModalToTop("createPromotionModal", "smooth");
        return;
    }

    const confirmBtn = document.getElementById("confirmBtn");
    document.getElementById("confirmTitle").textContent = "Create Promotion";
    document.getElementById("confirmMessage").textContent = "Are you sure you want to create this promotion?";
    confirmBtn.className = "confirm-btn createConfirm";
    confirmBtn.onclick = async () => {
        await confirmCreatePromotion();
    };

    openModal("confirmModal");
}

async function confirmCreatePromotion() {
    const payload = getCreatePayload();

    try {
        const res = await fetch(`${window.API_BASE}/api/promotions`, {
            method: "POST",
            headers: authHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            closeConfirm();
            showFormError("createPromotionError", extractErrorMessage(json, "Failed to create promotion."), "createPromotionModal");
            return;
        }

        closeConfirm();
        closeCreatePromotionModal();
        showToast(json.message || "Promotion created successfully.", "success");
        await fetchPromotions();
    } catch (err) {
        closeConfirm();
        showFormError("createPromotionError", err.message || "Failed to create promotion.", "createPromotionModal");
    }
}

// ---------- Update ----------
function validateUpdatePromotionForm() {
    const code = document.getElementById("update-promo-code").value.trim();
    const discount = document.getElementById("update-discount-percent").value.trim();
    const description = document.getElementById("update-promo-description").value.trim();
    const firstOrderOnly = document.getElementById("update-first-order-only").checked;
    const minCompletedOrders = document.getElementById("update-min-completed-orders").value.trim();
    const maxUsagePerCustomer = document.getElementById("update-max-usage-per-user").value.trim();
    const maxTotalUsage = document.getElementById("update-max-total-usage").value.trim();

    if (!code) return "Promo code is required.";
    if (!discount) return "Discount percent is required.";

    const discountNum = Number(discount);
    if (Number.isNaN(discountNum) || discountNum <= 0 || discountNum > 100) {
        return "Discount percent must be greater than 0 and not more than 100.";
    }

    if (!description) return "Description is required.";

    if (firstOrderOnly && minCompletedOrders) {
        return "First order only cannot be combined with minimum completed orders.";
    }

    if (minCompletedOrders && Number(minCompletedOrders) < 1) {
        return "Minimum completed orders must be at least 1.";
    }

    if (maxUsagePerCustomer && Number(maxUsagePerCustomer) < 1) {
        return "Max usage per customer must be at least 1.";
    }

    if (maxTotalUsage && Number(maxTotalUsage) < 1) {
        return "Max total usage must be at least 1.";
    }

    return null;
}

async function openUpdatePromotionModal(id) {
    clearFormError("updatePromotionError");

    try {
        const promo = promotionsById.get(String(id)) || await fetchPromotionById(id);

        document.getElementById("update-promo-id").value = promo.id;
        document.getElementById("update-promo-code").value = promo.code;
        document.getElementById("update-discount-percent").value = promo.discount_percent;
        document.getElementById("update-min-order-amount").value = promo.min_amount ?? "";
        document.getElementById("update-expires-at").value = toDateTimeLocalValue(promo.expires_at);
        document.getElementById("update-promo-description").value = promo.description ?? "";
        document.getElementById("update-first-order-only").checked = !!promo.first_order_only;
        document.getElementById("update-min-completed-orders").value = promo.min_completed_orders ?? "";
        document.getElementById("update-max-usage-per-user").value = promo.max_usage_per_customer ?? "";
        document.getElementById("update-max-total-usage").value = promo.max_total_usage ?? "";

        syncCustomerRuleInputs("update-first-order-only", "update-min-completed-orders", "update-max-usage-per-user");

        openModal("updatePromotionModal");
    } catch (err) {
        showToast(err.message || "Failed to load promotion.", "error");
    }
}

function closeUpdatePromotionModal() {
    closeModal("updatePromotionModal");
}

function openUpdateConfirm(event) {
    event?.preventDefault?.();
    clearFormError("updatePromotionError");

    const error = validateUpdatePromotionForm();
    if (error) {
        showFormError("updatePromotionError", error);
        scrollModalToTop("updatePromotionModal", "smooth");
        return;
    }

    const confirmBtn = document.getElementById("confirmBtn");
    document.getElementById("confirmTitle").textContent = "Update Promotion";
    document.getElementById("confirmMessage").textContent = "Are you sure you want to update this promotion?";
    confirmBtn.className = "confirm-btn updateConfirm";
    confirmBtn.onclick = async () => {
        await confirmUpdatePromotion();
    };

    openModal("confirmModal");
}

async function confirmUpdatePromotion() {
    const id = document.getElementById("update-promo-id").value;
    const payload = getUpdatePayload();

    try {
        const res = await fetch(`${window.API_BASE}/api/promotions/${id}`, {
            method: "POST",
            headers: authHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            closeConfirm();
            showFormError("updatePromotionError", extractErrorMessage(json, "Failed to update promotion."), "updatePromotionModal");
            return;
        }

        closeConfirm();
        closeUpdatePromotionModal();
        showToast(json.message || "Promotion updated successfully.", "success");
        await fetchPromotions();
    } catch (err) {
        closeConfirm();
        showFormError("updatePromotionError", err.message || "Failed to update promotion.", "updatePromotionModal");
    }
}

// ---------- Status ----------
function openStatusConfirm(id, makeActive) {
    const promo = promotionsById.get(String(id));
    if (!promo) return;

    document.getElementById("confirmTitle").textContent = makeActive ? "Enable Promotion" : "Disable Promotion";
    document.getElementById("confirmMessage").textContent =
        `Are you sure you want to ${makeActive ? "enable" : "disable"} ${promo.code}?`;

    const confirmBtn = document.getElementById("confirmBtn");
    confirmBtn.className = `confirm-btn ${makeActive ? "enableConfirm" : "disableConfirm"}`;
    confirmBtn.onclick = async () => {
        await setPromotionStatus(id, makeActive);
    };

    openModal("confirmModal");
}

async function setPromotionStatus(id, isActive) {
    try {
        const res = await fetch(`${window.API_BASE}/api/promotions/${id}/status`, {
            method: "PATCH",
            headers: authHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({ is_active: isActive })
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            throw new Error(extractErrorMessage(json, "Failed to update status."));
        }

        closeConfirm();
        showToast(
            json.message || (isActive ? "Promotion enabled successfully." : "Promotion disabled successfully."),
            isActive ? "success" : "warning"
        );
        await fetchPromotions();
    } catch (err) {
        closeConfirm();
        showToast(err.message || "Failed to update status.", "error");
    }
}

function closeConfirm() {
    closeModal("confirmModal");
}

// ---------- Events ----------
function setupTableActions() {
    const tbody = document.getElementById("promotion-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        const id = btn.dataset.id;
        const action = btn.dataset.action;

        if (!id || !action) return;

        if (action === "view") openViewPromotionModal(id);
        if (action === "edit") openUpdatePromotionModal(id);
        if (action === "disable") openStatusConfirm(id, false);
        if (action === "enable") openStatusConfirm(id, true);
    });
}

function setupOverlayClose() {
    document.querySelectorAll(".modal-overlay, .confirm-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeAllModals();
            }
        });
    });
}

function setupEscapeClose() {
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAllModals();
        }
    });
}

function setupFilters() {
    const searchInput = document.getElementById("promotionSearch");
    const statusFilter = document.getElementById("statusFilter");
    const ruleFilter = document.getElementById("ruleFilter");
    const showAllCheckbox = document.getElementById("showAllPromotions");

    let searchTimer;

    searchInput?.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            applyLocalFilters();
        }, 120);
    });

    statusFilter?.addEventListener("change", () => {
        applyLocalFilters();
    });

    ruleFilter?.addEventListener("change", () => {
        applyLocalFilters();
    });

    showAllCheckbox?.addEventListener("change", () => {
        applyLocalFilters();
    });
}

function setupPagination() {
    const container = document.getElementById("promotionsPagination");
    if (!container) return;

    container.addEventListener("click", (e) => {
        const btn = e.target.closest(".page-btn");
        if (!btn || btn.disabled) return;

        const page = Number(btn.dataset.page || 1);
        const totalPages = Math.ceil(promotionsFiltered.length / pageSize);
        if (!page || page < 1 || page > totalPages || page === currentPage) return;

        currentPage = page;
        renderPromotionsTable();
        renderPagination();
    });
}

// ---------- Init ----------
async function waitForAuthReady(timeoutMs = 4000) {
    const start = Date.now();

    while (!window.__AUTH_READY__) {
        if (Date.now() - start > timeoutMs) break;
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (window.__AUTH_READY__) {
        await window.__AUTH_READY__;
    }
}

async function initPromotionsPage() {
    await waitForAuthReady();

    if (!window.__ADMIN__) return;
    if (!requireRole(window.__ADMIN__, ["superadmin", "manager"])) return;

    setupCustomerRuleToggle("first-order-only", "min-completed-orders", "max-usage-per-user");
    setupCustomerRuleToggle("update-first-order-only", "update-min-completed-orders", "update-max-usage-per-user");
    setupOverlayClose();
    setupEscapeClose();
    setupTableActions();
    setupFilters();
    setupPagination();

    await fetchPromotions();
}

document.addEventListener("DOMContentLoaded", () => {
    initPromotionsPage().catch(err => {
        showToast(err.message || "Failed to load promotions.", "error");
    });
});