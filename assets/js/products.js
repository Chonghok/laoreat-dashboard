/* ============================
   PRODUCTS.JS (Fresh - works with Laravel controllers above)
============================ */

let productsAll = [];
let productsById = new Map();

let categoriesAll = [];
let categoriesById = new Map();

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
function formatDateTime(v) {
    if (!v) return "-";

    // supports: "2026-03-04 14:10:22" or ISO
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

function scrollModalToTop(overlayEl) {
    const modal = overlayEl?.querySelector(".modal");
    if (modal) {
        modal.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

function viewerRole() {
  return String(window.__ADMIN__?.role || "").toLowerCase();
}
function canEditProducts() {
    const r = viewerRole();
    return r === "superadmin" || r === "manager";
}

function money(n) {
    const num = Number(n ?? 0);
    return `$${num.toFixed(2)}`;
}

function isOn(v) {
    return Number(v) === 1 || v === true || v === "1";
}

function discountInfo(p) {
    const price = Number(p.price || 0);
    const active = isOn(p.discount_active);
    const pct = Number(p.discount_percent || 0);

    if (!active || pct <= 0) {
      return { has: false, now: price, old: null, pct: null };
    }
    const now = price - (price * pct / 100);
    return { has: true, now, old: price, pct };
}

function categoryName(id) {
    return categoriesById.get(String(id))?.name || "-";
}

function closeCreateModal() {
    createOverlay.classList.remove("active");
    const modal = createOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
}

function closeUpdateModalSafe() {
    updateOverlay.classList.remove("active");
    clearUpdateError();
    const modal = updateOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
}

function closeViewModalSafe() {
    viewOverlay.classList.remove("active");
    const modal = viewOverlay?.querySelector(".modal");
    if (modal) setTimeout(() => { modal.scrollTop = 0; }, 260);
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

// ---------- Load Data ----------
async function loadCategories() {
    const json = await apiFetch("/api/categories");
    categoriesAll = json.data || [];
    categoriesById = new Map(categoriesAll.map(c => [String(c.id), c]));

    // fill filter
    const filter = document.getElementById("categoryFilter");
    if (filter) {
        filter.innerHTML = `<option value="all">All Categories</option>`;
        categoriesAll.forEach(c => {
        const opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = c.name;
        filter.appendChild(opt);
        });
    }

    // fill create select
    const createSel = document.getElementById("product-category");
    if (createSel) {
        createSel.innerHTML = "";
        categoriesAll.forEach(c => {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = c.name;
            createSel.appendChild(opt);
        });
        if (categoriesAll.length) createSel.value = String(categoriesAll[0].id);
    }

    // fill update select
    const updateSel = document.getElementById("update-product-category");
    if (updateSel) {
        updateSel.innerHTML = "";
            categoriesAll.forEach(c => {
            const opt = document.createElement("option");
            opt.value = String(c.id);
            opt.textContent = c.name;
            updateSel.appendChild(opt);
        });
    }
}

async function loadProducts() {
  const json = await apiFetch("/api/products");
  productsAll = json.data || [];
  productsById = new Map(productsAll.map(p => [String(p.id), p]));
}

// ---------- Filtering + Pagination ----------
function getFiltered() {
    const q = (document.getElementById("productSearch")?.value || "").trim().toLowerCase();
    const showAll = !!document.getElementById("showAllProducts")?.checked;
    const cat = document.getElementById("categoryFilter")?.value || "all";
    const avail = document.getElementById("availabilityFilter")?.value || "all";

    let arr = productsAll;

    if (!showAll) arr = arr.filter(p => isOn(p.is_active));

    if (cat !== "all") arr = arr.filter(p => String(p.category_id) === String(cat));

    if (avail === "available") arr = arr.filter(p => isOn(p.is_available));
    if (avail === "unavailable") arr = arr.filter(p => !isOn(p.is_available));

    if (q) {
        arr = arr.filter(p => {
        const idStr = String(p.id || "");
        const name = String(p.name || "").toLowerCase();
        return idStr.includes(q) || name.includes(q);
        });
    }

    return arr;
}

function upsertLocalProduct(p) {
    const id = String(p.id);
    const idx = productsAll.findIndex(x => String(x.id) === id);
    if (idx >= 0) productsAll[idx] = { ...productsAll[idx], ...p };
    else productsAll.push(p);
    productsAll.sort((a, b) => Number(a.id) - Number(b.id));
    productsById = new Map(productsAll.map(x => [String(x.id), x]));
}

function patchLocalProduct(id, patch) {
    const key = String(id);
    const p = productsById.get(key);
    if (!p) return;
    const next = { ...p, ...patch };
    productsById.set(key, next);

    const idx = productsAll.findIndex(x => String(x.id) === key);
    if (idx >= 0) productsAll[idx] = next;
}

function renderPagination(total) {
    const holder = document.getElementById("productsPagination");
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

    // show 1..N small window
    const totalPagesShow = Math.max(1, Math.ceil(total / pageSize));
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPagesShow, start + 4);

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
    const tbody = document.getElementById("product-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    const isEditor = canEditProducts();

    const frag = document.createDocumentFragment();

    rows.forEach(p => {
        const tr = document.createElement("tr");
        if (!isOn(p.is_active)) tr.classList.add("row-inactive");

        const disc = discountInfo(p);

        const priceHTML = disc.has
        ? `
            <div class="price-wrap">
            <div class="price-discounted">${money(disc.now)}</div>
            <div class="price-original">${money(disc.old)}</div>
            </div>
        `
        : `
            <div class="price-wrap">
            <div class="price-now">${money(p.price)}</div>
            </div>
        `;

        const pct = Number(p.discount_percent || 0);
        const active = isOn(p.discount_active);

        const discountBadge =
        pct > 0
            ? `<span class="badge ${active ? "discount" : "none"}">${pct.toFixed(0)}%</span>`
            : `<span class="badge none">No Discount</span>`;

        const actions = (() => {
        const view = `<div class="view-icon action-btn act-view" data-id="${p.id}" title="View"><i class="ri-list-check"></i></div>`;
        if (!isEditor) return view;

        const edit = `<div class="edit-icon action-btn act-edit" data-id="${p.id}" title="Update"><i class="ri-edit-2-fill"></i></div>`;
        const toggle = isOn(p.is_active)
            ? `<div class="disable-icon action-btn act-disable" data-id="${p.id}" title="Disable"><i class="ri-prohibited-2-line"></i></div>`
            : `<div class="enable-icon action-btn act-enable" data-id="${p.id}" title="Enable"><i class="ri-loop-left-line"></i></div>`;
        return view + edit + toggle;
        })();

        tr.innerHTML = `
        <td>${p.id}</td>
        <td><img class="product-img" src="${p.image_url || "assets/images/default-user.webp"}" alt="Product"></td>
        <td class="name-cell" title="${p.name || ""}">${p.name || "-"}</td>
        <td class="category-cell" title="${categoryName(p.category_id)}">${categoryName(p.category_id)}</td>
        <td class="price-cell">${priceHTML}</td>
        <td>${discountBadge}</td>
        <td>
            <label class="switch" title="Toggle availability">
            <input class="avail-toggle" data-id="${p.id}" type="checkbox" ${isOn(p.is_available) ? "checked" : ""}>
            <span class="slider"></span>
            </label>
        </td>
        <td class="status-cell ${isOn(p.is_active) ? "active" : "inactive"}">${isOn(p.is_active) ? "Active" : "Inactive"}</td>
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

// ---------- Create Modal ----------
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

window.openCreateProductModal = function () {
    if (!canEditProducts()) return showToast("No permission", "error");
    const sel = document.getElementById("product-category");
    if (!sel || sel.options.length === 0) {
        showToast("Categories not loaded yet", "warning");
        return;
    }
    resetCreateModal();
    createOverlay.classList.add("active");
};

window.closeModal = closeCreateModal;

createOverlay?.addEventListener("click", (e) => {
  if (e.target === createOverlay) closeModal();
});

function resetCreateModal() {
    clearCreateError();
    document.getElementById("product-name").value = "";
    const sel = document.getElementById("product-category");
    if (sel && sel.options.length > 0) {
        sel.selectedIndex = 0;
    }
    // document.getElementById("product-category").value = "";
    document.getElementById("product-price").value = "";
    document.getElementById("product-unit").value = "";
    document.getElementById("product-description").value = "";
    document.getElementById("discount-active").checked = false;
    document.getElementById("discount-percent").value = "";
    document.getElementById("discount-percent").disabled = true;

    document.getElementById("product-image-upload").value = "";
    document.getElementById("productImagePreview").innerHTML = `<i class="ri-camera-4-fill"></i>`;

    const modal = createOverlay?.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

// preview create image
document.getElementById("product-image-upload")?.addEventListener("change", function () {
  const file = this.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("productImagePreview").innerHTML = `<img src="${e.target.result}" alt="Product">`;
  };
  reader.readAsDataURL(file);
});

// discount toggle create
document.getElementById("discount-active")?.addEventListener("change", function () {
    const input = document.getElementById("discount-percent");
    input.disabled = !this.checked;
});

window.confirmCreateProduct = function (e) {
    if (e) e.preventDefault();
    if (!canEditProducts()) return showToast("No permission", "error");

    clearCreateError();

    const img = document.getElementById("product-image-upload").files?.[0];
    const name = document.getElementById("product-name").value.trim();
    const categoryId = document.getElementById("product-category").value;
    const price = Number(document.getElementById("product-price").value);
    const unitLabel = document.getElementById("product-unit").value.trim();
    const description = document.getElementById("product-description").value.trim();
    
    const discOn = document.getElementById("discount-active").checked;
    const discPct = Number(document.getElementById("discount-percent").value);
    

    if (!img) return showCreateError("Product image is required.");
    if (!name) return showCreateError("Name is required.");
    if (!categoryId) return showCreateError("Category is required.");
    if (!Number.isFinite(price) || price < 0) return showCreateError("Invalid price.");
    if (!unitLabel) return showCreateError("Unit label is required.");
    if (!description) return showCreateError("Description is required.");
    if (discOn && (!Number.isFinite(discPct) || discPct <= 0 || discPct > 100)) {
        return showCreateError("Discount % must be 1 - 100.");
    }

    openConfirm({
        title: "Create Product",
        message: "Create this product?",
        type: "createConfirm",
        onConfirm: createProduct
    });
};

async function createProduct() {
    const fd = new FormData();
    fd.append("name", document.getElementById("product-name").value.trim());
    fd.append("category_id", document.getElementById("product-category").value);
    fd.append("price", document.getElementById("product-price").value);
    fd.append("unit_label", document.getElementById("product-unit").value.trim());
    fd.append("description", document.getElementById("product-description").value.trim());

    const discOn = document.getElementById("discount-active").checked;
    fd.append("discount_active", discOn ? "1" : "0");
    if (discOn) fd.append("discount_percent", document.getElementById("discount-percent").value);

    const img = document.getElementById("product-image-upload").files?.[0];
    fd.append("image", img);

    try {
        const json = await apiFetch("/api/products", { method: "POST", body: fd });
        // if (json?.data) upsertLocalProduct(json.data);
        closeConfirm();
        closeModal();
        
        await loadProducts();
        const total = getFiltered().length;
        currentPage = Math.max(1, Math.ceil(total / pageSize));
        render();
        showToast("Product created");
        return true;
    } catch (err) {
        showCreateError(err.message || "Create failed");
        showToast("Create failed", "error");
        return false;
    }
}

// ---------- View Modal ----------
const viewOverlay = document.getElementById("viewModal");
window.closeViewModal = closeViewModalSafe;

viewOverlay?.addEventListener("click", (e) => {
    if (e.target === viewOverlay) closeViewModal();
});

function fillViewModal(p) {
    const disc = discountInfo(p);

    document.getElementById("view-name").textContent = p.name || "-";
    document.getElementById("view-id").textContent = p.id ?? "-";
    document.getElementById("view-category").textContent = categoryName(p.category_id);

    const status = document.getElementById("view-status");
    status.textContent = isOn(p.is_active) ? "Active" : "Inactive";
    status.className = `pbadge status ${isOn(p.is_active) ? "active" : "inactive"}`;

    const avail = document.getElementById("view-available");
    avail.textContent = isOn(p.is_available) ? "Available" : "Unavailable";
    avail.className = `pbadge avail ${isOn(p.is_available) ? "on" : "off"}`;

    const discEl = document.getElementById("view-discount");
    const pct = Number(p.discount_percent || 0);
    const active = isOn(p.discount_active);
    if (pct > 0) {
        discEl.textContent = `${pct.toFixed(0)}%`;
        discEl.className = `pbadge discount ${active ? "on" : "off"}`;
    } else {
        discEl.textContent = "No Discount";
        discEl.className = "pbadge discount off";
    }

    document.getElementById("view-price-now").textContent = disc.has ? money(disc.now) : money(p.price);

    const old = document.getElementById("view-price-old");
    if (disc.has) {
        old.style.display = "";
        old.textContent = money(disc.old);
    } else {
        old.style.display = "none";
    }

    const unit = document.getElementById("view-unit");
    if ((p.unit_label || "").trim()) {
        unit.style.display = "";
        unit.textContent = `/${p.unit_label}`;
    } else {
        unit.style.display = "none";
    }

    document.getElementById("view-description").textContent = p.description || "-";
    document.getElementById("view-created-at").textContent = formatDateTime(p.created_at) || "-";
    document.getElementById("view-updated-at").textContent = formatDateTime(p.updated_at) || "-";

    const img = document.getElementById("viewImagePreview");
    img.innerHTML = p.image_url ? `<img src="${p.image_url}" alt="Product">` : `<i class="ri-image-line"></i>`;
}

function openViewModal(p) {
    fillViewModal(p);
    viewOverlay.classList.add("active");
    const modal = viewOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

// ---------- Update Modal ----------
const updateOverlay = document.getElementById("updateModal");
window.closeUpdateModal = closeUpdateModalSafe;

updateOverlay?.addEventListener("click", (e) => {
    if (e.target === updateOverlay) closeUpdateModal();
});

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

// preview update image
document.getElementById("update-product-image-upload")?.addEventListener("change", function () {
  const file = this.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("updateImagePreview").innerHTML = `<img src="${e.target.result}" alt="Product">`;
  };
  reader.readAsDataURL(file);
});

// discount toggle update
document.getElementById("update-discount-active")?.addEventListener("change", function () {
    const input = document.getElementById("update-discount-percent");
    if (!input) return;
    input.disabled = !this.checked;
});

function fillUpdateModal(p) {
    clearUpdateError();

    document.getElementById("update-id").value = p.id;
    document.getElementById("update-product-name").value = p.name || "";
    document.getElementById("update-product-category").value = String(p.category_id || "");
    document.getElementById("update-product-price").value = Number(p.price || 0).toFixed(2);
    document.getElementById("update-product-unit").value = p.unit_label || "";
    document.getElementById("update-product-description").value = p.description || "";

    document.getElementById("update-product-image-upload").value = "";
    document.getElementById("updateImagePreview").innerHTML = p.image_url
        ? `<img src="${p.image_url}" alt="Product">`
        : `<i class="ri-camera-4-fill"></i>`;

    const isActive = isOn(p.discount_active);
    const pctInput = document.getElementById("update-discount-percent");
    document.getElementById("update-discount-active").checked = isActive;
    if (pctInput) {
        pctInput.value = (p.discount_percent ?? "") === null ? "" : String(p.discount_percent ?? "");
        pctInput.disabled = !isActive;
    }
}

function openUpdateModal(p) {
    if (!canEditProducts()) return showToast("No permission", "error");
    fillUpdateModal(p);
    updateOverlay.classList.add("active");
    const modal = updateOverlay.querySelector(".modal");
    if (modal) modal.scrollTop = 0;
}

window.confirmUpdateProduct = function (e) {
    if (e) e.preventDefault();
    if (!canEditProducts()) return showToast("No permission", "error");

    clearUpdateError();

    const id = document.getElementById("update-id").value;
    const name = document.getElementById("update-product-name").value.trim();
    const categoryId = document.getElementById("update-product-category").value;
    const price = Number(document.getElementById("update-product-price").value);
    const unitLabel = document.getElementById("update-product-unit").value.trim();
    const description = document.getElementById("update-product-description").value.trim();

    const discOn = document.getElementById("update-discount-active").checked;
    const discPctRaw = document.getElementById("update-discount-percent").value.trim();
    const discPct = discPctRaw === "" ? null : Number(discPctRaw);

    if (!id) return showUpdateError("Missing product id.");
    if (!name) return showUpdateError("Name is required.");
    if (!categoryId) return showUpdateError("Category is required.");
    if (!Number.isFinite(price) || price < 0) return showUpdateError("Invalid price.");
    if (!unitLabel) return showUpdateError("Unit label is required.");
    if (!description) return showUpdateError("Description is required.");
    if (discOn && (!Number.isFinite(discPct) || discPct <= 0 || discPct > 100)) {
        return showUpdateError("Discount % must be 1 - 100.");
    }

    openConfirm({
        title: "Update Product",
        message: "Save changes to this product?",
        type: "updateConfirm",
        onConfirm: updateProduct
    });
};

async function updateProduct() {
    const id = document.getElementById("update-id").value;

    const fd = new FormData();
    fd.append("name", document.getElementById("update-product-name").value.trim());
    fd.append("category_id", document.getElementById("update-product-category").value);
    fd.append("price", document.getElementById("update-product-price").value);
    fd.append("unit_label", document.getElementById("update-product-unit").value.trim());
    fd.append("description", document.getElementById("update-product-description").value.trim());

    const discOn = document.getElementById("update-discount-active").checked;
    fd.append("discount_active", discOn ? "1" : "0");
    const pctVal = document.getElementById("update-discount-percent").value.trim();
    if (pctVal !== "") fd.append("discount_percent", pctVal);

    const img = document.getElementById("update-product-image-upload").files?.[0];
    if (img) fd.append("image", img);

    try {
        const json = await apiFetch(`/api/products/${id}`, { method: "POST", body: fd });
        if (json?.data) upsertLocalProduct(json.data);
        closeConfirm();
        closeUpdateModal();
        await loadProducts();
        render();
        showToast("Product updated");
        return true;
    } catch (err) {
        showUpdateError(err.message || "Update failed");
        showToast("Update failed", "error");
        return false;
    }
}

// ---------- Availability toggle realtime ----------
async function setAvailability(id, on) {
  await apiFetch(`/api/products/${id}/availability`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_available: on ? 1 : 0 })
  });
}

// ---------- Status enable/disable realtime ----------
async function setStatus(id, on) {
  await apiFetch(`/api/products/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: on ? 1 : 0 })
  });
}

// ---------- Table events (delegation) ----------
function wireTableEvents() {
    const tbody = document.getElementById("product-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        const id = btn.dataset.id;
        const p = productsById.get(String(id));
        if (!p) return showToast("Product not found", "error");

        if (btn.classList.contains("act-view")) {
        openViewModal(p);
        return;
        }

        if (btn.classList.contains("act-edit")) {
        openUpdateModal(p);
        return;
        }

        if (btn.classList.contains("act-disable")) {
        openConfirm({
            title: "Disable Product",
            message: "Disable this product?",
            type: "disableConfirm",
            onConfirm: async () => {
            try {
                await setStatus(id, 0);
                patchLocalProduct(id, { is_active: 0 });
                closeConfirm();
                render();
                showToast("Product disabled", "warning");
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
            title: "Enable Product",
            message: "Enable this product?",
            type: "enableConfirm",
            onConfirm: async () => {
            try {
                await setStatus(id, 1);
                patchLocalProduct(id, { is_active: 1 });
                closeConfirm();
                render();
                showToast("Product enabled", "success");
                return true;
            } catch (err) {
                showToast(err.message || "Failed", "error");
                return false;
            }
            }
        });
        return;
        }
    });

    tbody.addEventListener("change", async (e) => {
        const t = e.target;
        if (!t.classList.contains("avail-toggle")) return;

        const id = t.dataset.id;
        const on = t.checked;

        try {
        await setAvailability(id, on);
        patchLocalProduct(id, { is_available: on ? 1 : 0 });

        render();
        showToast("Availability updated");
        } catch (err) {
        showToast(err.message || "Failed", "error");
        // revert UI
        const p = productsById.get(String(id));
        if (p) t.checked = isOn(p.is_available);
        }
    });
}

// ---------- Filters wiring ----------
function wireFilters() {
  const search = document.getElementById("productSearch");
  const showAll = document.getElementById("showAllProducts");
  const cat = document.getElementById("categoryFilter");
  const avail = document.getElementById("availabilityFilter");

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
  cat?.addEventListener("change", () => { currentPage = 1; render(); });
  avail?.addEventListener("change", () => { currentPage = 1; render(); });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // wait global auth
  if (window.__AUTH_READY__) await window.__AUTH_READY__;

  // role UI: hide create for operator
  const createBtn = document.querySelector(".btn-create");
  if (createBtn) createBtn.style.display = canEditProducts() ? "" : "none";

  await loadCategories();
  await loadProducts();

  wireFilters();
  wireTableEvents();

  render();
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    // close confirm first (highest priority)
    if (confirmOverlay?.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (updateOverlay?.classList.contains("active")) {
        closeUpdateModalSafe();
        return;
    }

    if (viewOverlay?.classList.contains("active")) {
        closeViewModalSafe();
        return;
    }

    if (createOverlay?.classList.contains("active")) {
        closeCreateModal();
        return;
    }
});