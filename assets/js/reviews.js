let reviewProductsAll = [];
let reviewProductsById = new Map();

let currentPage = 1;
const pageSize = 15;

let toastTimer;

let confirmAction = null;
let currentModalProductId = null;

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

function viewerRole() {
    return String(window.__ADMIN__?.role || "").toLowerCase();
}

function canModerateReviews() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager";
}

function isOn(v) {
    return Number(v) === 1 || v === true || v === "1";
}

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

function getReviewDateText(review) {
    const created = review?.created_at || null;
    const updated = review?.updated_at || null;

    if (!created) return "-";

    const createdRaw = String(created).replace(" ", "T");
    const updatedRaw = String(updated || "").replace(" ", "T");

    const createdDate = new Date(createdRaw);
    const updatedDate = new Date(updatedRaw);

    if (
        updated &&
        !Number.isNaN(createdDate.getTime()) &&
        !Number.isNaN(updatedDate.getTime()) &&
        updatedDate.getTime() !== createdDate.getTime()
    ) {
        return `Edited • ${formatDateTime(updated)}`;
    }

    return formatDateTime(created);
}

function renderStars(rating) {
    const value = Math.max(0, Math.min(5, Number(rating || 0)));
    const full = Math.round(value);
    let html = '<div class="review-stars" aria-label="' + full + ' out of 5 stars">';

    for (let i = 1; i <= 5; i++) {
        html += `<i class="ri-star-${i <= full ? "fill" : "line"} ${i <= full ? "filled" : "empty"}"></i>`;
    }

    html += `<span class="review-stars-text">${full} ${full === 1 ? "star" : "stars"}</span>`;
    html += '</div>';

    return html;
}

async function apiFetch(path, opts = {}) {
    const token = (typeof getToken === "function") ? getToken() : null;

    const headers = {
        Accept: "application/json",
        ...(opts.headers || {})
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        throw new Error(json?.message || `Request failed (${res.status})`);
    }

    return json;
}

function openConfirm({ title, message, type = "hideConfirm", onConfirm }) {
    const confirmOverlay = document.getElementById("confirmModal");
    const confirmTitle = document.getElementById("confirmTitle");
    const confirmMessage = document.getElementById("confirmMessage");
    const confirmBtn = document.getElementById("confirmBtn");

    if (!confirmOverlay || !confirmTitle || !confirmMessage || !confirmBtn) return;

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmBtn.className = `confirm-btn ${type}`;
    confirmAction = onConfirm;
    confirmOverlay.classList.add("active");
}

function closeConfirm() {
    const confirmOverlay = document.getElementById("confirmModal");
    if (!confirmOverlay) return;
    confirmOverlay.classList.remove("active");
    confirmAction = null;
}

async function loadReviewProducts() {
    const json = await apiFetch("/api/products/reviews");
    const raw = json?.data || [];

    reviewProductsAll = raw.map(item => ({
        ...item,
        total_reviews: Number(item.total_reviews || 0),
        visible_reviews: Number(item.visible_reviews || 0),
        hidden_reviews: Number(item.hidden_reviews || 0),
        average_rating: Number(item.average_rating || 0)
    }));

    reviewProductsById = new Map(reviewProductsAll.map(p => [String(p.id), p]));
}

function getFilteredProducts() {
    const q = (document.getElementById("reviewSearch")?.value || "").trim().toLowerCase();
    const visibility = document.getElementById("visibilityFilter")?.value || "all";
    const rating = document.getElementById("ratingFilter")?.value || "all";

    let arr = [...reviewProductsAll];

    if (q) {
        arr = arr.filter(p => {
            const idStr = String(p.id || "");
            const name = String(p.name || "").toLowerCase();
            return idStr.includes(q) || name.includes(q);
        });
    }

    if (visibility === "has_hidden") {
        arr = arr.filter(p => Number(p.hidden_reviews || 0) > 0);
    } else if (visibility === "fully_visible") {
        arr = arr.filter(p => Number(p.hidden_reviews || 0) === 0);
    }

    if (rating === "4") {
        arr = arr.filter(p => Number(p.average_rating || 0) >= 4);
    } else if (rating === "3") {
        arr = arr.filter(p => Number(p.average_rating || 0) >= 3);
    } else if (rating === "below3") {
        arr = arr.filter(p => Number(p.average_rating || 0) < 3);
    }

    return arr;
}

function renderPagination(total) {
    const holder = document.getElementById("reviewsPagination");
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
    const tbody = document.getElementById("reviews-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="padding: 24px; color: var(--muted);">
                    No products found.
                </td>
            </tr>
        `;
        return;
    }

    const frag = document.createDocumentFragment();

    rows.forEach(p => {
        const tr = document.createElement("tr");
        const flagged = Number(p.hidden_reviews || 0) > 0;

        tr.innerHTML = `
            <td>${p.id}</td>
            <td><img class="product-img" src="${p.image_url || "assets/images/default-user.webp"}" alt="Product"></td>
            <td class="name-cell" title="${p.name || ""}">${p.name || "-"}</td>
            <td><span class="rating-badge"><i class="ri-star-fill"></i> ${Number(p.average_rating || 0).toFixed(1)}</span></td>
            <td>${p.total_reviews}</td>
            <td><span class="count-badge visible">${p.visible_reviews}</span></td>
            <td><span class="count-badge hidden">${p.hidden_reviews}</span></td>
            <td><span class="status-badge ${flagged ? "flagged" : "clean"}">${flagged ? "Needs Review" : "Clean"}</span></td>
            <td class="action-icon">
                <div class="view-icon action-btn act-view" data-id="${p.id}" title="View Reviews">
                    <i class="ri-list-check"></i>
                </div>
            </td>
        `;

        frag.appendChild(tr);
    });

    tbody.appendChild(frag);
}

function render() {
    const filtered = getFilteredProducts();
    const total = filtered.length;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    renderTable(pageItems);
    renderPagination(total);
}

async function openReviewsModal(productId) {
    const reviewsModal = document.getElementById("reviewsModal");
    const json = await apiFetch(`/api/products/${productId}/reviews`);
    const product = json.product;
    const reviews = json.reviews || [];

    currentModalProductId = String(productId);

    document.getElementById("modalProductName").textContent = product?.name || "-";
    document.getElementById("modalProductId").textContent = product?.id ?? "-";
    document.getElementById("modalReviewCount").textContent = reviews.length;

    const img = document.getElementById("modalProductImage");
    img.innerHTML = product?.image_url
        ? `<img src="${product.image_url}" alt="Product">`
        : `<i class="ri-image-line"></i>`;

    const holder = document.getElementById("modalReviewsList");
    holder.innerHTML = "";

    if (!reviews.length) {
        holder.innerHTML = `<div class="empty-state">This product has no reviews yet.</div>`;
    } else {
        const frag = document.createDocumentFragment();

        reviews.forEach(r => {
            const customer = r.customer || {};
            const canModerate = canModerateReviews();

            const card = document.createElement("div");
            card.className = "review-card";

            card.innerHTML = `
                <div class="review-top">
                    <div class="review-user">
                        <img class="review-avatar" src="${customer.profile_url || "assets/images/default-user.webp"}" alt="Customer">
                        <div class="review-user-meta">
                            <div class="review-username">${customer.username || "Customer"}</div>
                            <div class="review-email">${customer.email || "-"}</div>
                        </div>
                    </div>

                    <div class="review-right">
                        ${renderStars(r.rating)}
                        <span class="visibility-badge ${isOn(r.is_visible) ? "visible" : "hidden"}">
                            ${isOn(r.is_visible) ? "Visible" : "Hidden"}
                        </span>
                    </div>
                </div>

                <div class="review-date">${getReviewDateText(r)}</div>
                <div class="review-comment">${(r.comment || "").trim() ? r.comment : "No comment provided."}</div>

                <div class="review-actions">
                    ${
                        canModerate
                        ? `<button
                                class="toggle-review-btn ${isOn(r.is_visible) ? "hide" : "unhide"}"
                                data-review-id="${r.id}"
                                data-visible="${isOn(r.is_visible) ? 1 : 0}">
                                ${isOn(r.is_visible) ? "Hide Review" : "Unhide Review"}
                           </button>`
                        : ``
                    }
                </div>
            `;

            frag.appendChild(card);
        });

        holder.appendChild(frag);
    }

    reviewsModal.classList.add("active");
    const modal = reviewsModal.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

function closeReviewsModalSafe() {
    const reviewsModal = document.getElementById("reviewsModal");
    if (!reviewsModal) return;
    reviewsModal.classList.remove("active");
}

window.closeReviewsModal = closeReviewsModalSafe;

async function toggleReviewVisibility(reviewId) {
    await apiFetch(`/api/reviews/${reviewId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
    });
}

function wireTableEvents() {
    const tbody = document.getElementById("reviews-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest(".act-view");
        if (!btn) return;

        const id = btn.dataset.id;
        try {
            await openReviewsModal(id);
        } catch (err) {
            showToast(err.message || "Failed to load reviews", "error");
        }
    });
}

function wireModalEvents() {
    const holder = document.getElementById("modalReviewsList");
    if (!holder) return;

    holder.addEventListener("click", (e) => {
        const btn = e.target.closest(".toggle-review-btn");
        if (!btn) return;
        if (!canModerateReviews()) return showToast("No permission", "error");

        const reviewId = btn.dataset.reviewId;
        const currentlyVisible = btn.dataset.visible === "1";

        openConfirm({
            title: currentlyVisible ? "Hide Review" : "Unhide Review",
            message: currentlyVisible
                ? "Hide this review from customers?"
                : "Make this review visible again?",
            type: currentlyVisible ? "hideConfirm" : "unhideConfirm",
            onConfirm: async () => {
                try {
                    await toggleReviewVisibility(reviewId);
                    closeConfirm();

                    if (currentModalProductId) {
                        await openReviewsModal(currentModalProductId);
                    }

                    await loadReviewProducts();
                    render();

                    showToast(
                        currentlyVisible ? "Review hidden" : "Review unhidden",
                        currentlyVisible ? "warning" : "success"
                    );
                    return true;
                } catch (err) {
                    showToast(err.message || "Action failed", "error");
                    return false;
                }
            }
        });
    });
}

function wireFilters() {
    const search = document.getElementById("reviewSearch");
    const visibility = document.getElementById("visibilityFilter");
    const rating = document.getElementById("ratingFilter");

    let t;
    const live = () => {
        clearTimeout(t);
        t = setTimeout(() => {
            currentPage = 1;
            render();
        }, 120);
    };

    search?.addEventListener("input", live);
    visibility?.addEventListener("change", () => {
        currentPage = 1;
        render();
    });
    rating?.addEventListener("change", () => {
        currentPage = 1;
        render();
    });

    const confirmOverlay = document.getElementById("confirmModal");
    const cancelBtn = document.getElementById("cancelConfirm");
    const confirmBtn = document.getElementById("confirmBtn");
    const reviewsModal = document.getElementById("reviewsModal");

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

    reviewsModal?.addEventListener("click", (e) => {
        if (e.target === reviewsModal) closeReviewsModalSafe();
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        let waited = 0;

        while (!window.__AUTH_READY__ && waited < 5000) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waited += 100;
        }

        if (window.__AUTH_READY__) {
            await window.__AUTH_READY__;
        }

        const admin = window.__ADMIN__;
        if (!admin) return;
        if (!requireRole(admin, ["superadmin", "manager"])) return;

        await loadReviewProducts();

        wireFilters();
        wireTableEvents();
        wireModalEvents();

        render();
    } catch (err) {
        console.error("Reviews page init failed:", err);
        showToast(err.message || "Failed to load reviews page", "error");
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const confirmOverlay = document.getElementById("confirmModal");
    const reviewsModal = document.getElementById("reviewsModal");

    if (confirmOverlay?.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (reviewsModal?.classList.contains("active")) {
        closeReviewsModalSafe();
    }
});