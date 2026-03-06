let categoriesAll = [];
let categoriesById = new Map();

let toastTimer;

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

function getCategoryImage(url) {
    return url || "assets/images/default-user.webp";
}

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

function showFormError(elId, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
}

function clearFormError(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
}

function setImagePreview(containerId, url, iconClass = "ri-camera-4-fill") {
    const box = document.getElementById(containerId);
    if (!box) return;

    if (url) {
        box.innerHTML = `<img src="${url}" alt="Preview">`;
    } else {
        box.innerHTML = `<i class="${iconClass}"></i>`;
    }
}

function bindImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
            setImagePreview(previewId, null);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setImagePreview(previewId, e.target.result);
        };
        reader.readAsDataURL(file);
    });
}

async function apiFetch(url, options = {}) {
    const token = getToken();

    const headers = {
        "Accept": "application/json",
        ...(options.headers || {}),
    };

    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
        ...options,
        headers,
    });

    const json = await res.json().catch(() => null);

    if (res.status === 401) {
        logoutLocal();
        throw new Error("Unauthorized");
    }

    if (!res.ok || !json?.success) {
        if (json?.errors) {
            const firstKey = Object.keys(json.errors)[0];
            const firstMsg = json.errors[firstKey]?.[0];
            throw new Error(firstMsg || json?.message || "Request failed.");
        }
        throw new Error(json?.message || "Request failed.");
    }

    return json;
}

// ---------- Modal controls ----------
function openCreateCategoryModal() {
    clearFormError("createError");
    document.getElementById("category-name").value = "";
    document.getElementById("category-sort-order").value = "";
    document.getElementById("category-image-upload").value = "";
    setImagePreview("categoryImagePreview", null);
    document.getElementById("createModal")?.classList.add("active");
}

function closeCreateCategoryModal() {
    document.getElementById("createModal")?.classList.remove("active");
}

function closeViewCategoryModal() {
    document.getElementById("viewModal")?.classList.remove("active");
}

function closeUpdateCategoryModal() {
    document.getElementById("updateModal")?.classList.remove("active");
}

function closeConfirm() {
    document.getElementById("confirmModal")?.classList.remove("active");
}

function openConfirm({ title, message, confirmClass, onConfirm }) {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const btn = document.getElementById("confirmBtn");

    titleEl.textContent = title;
    msgEl.textContent = message;
    btn.className = `confirm-btn ${confirmClass || ""}`;

    btn.onclick = async () => {
        btn.disabled = true;
        try {
            await onConfirm?.();
        } catch (err) {
            showToast(err.message || "Action failed.", "error");
        } finally {
            btn.disabled = false;
            closeConfirm();
        }
    };

    modal.classList.add("active");
}

// ---------- Load + render ----------
async function loadCategories() {
    const json = await apiFetch(`${API_BASE}/api/categories`);
    categoriesAll = Array.isArray(json.data) ? json.data : [];
    categoriesById = new Map(categoriesAll.map(c => [Number(c.id), c]));
    renderCategoryTable();
}

function getFilteredCategories() {
    const q = (document.getElementById("categorySearch")?.value || "").trim().toLowerCase();
    const showAll = !!document.getElementById("showAllCategories")?.checked;

    return categoriesAll.filter(cat => {
        const matchesSearch =
            String(cat.id).includes(q) ||
            String(cat.name || "").toLowerCase().includes(q);

        const matchesStatus = showAll ? true : Number(cat.is_active) === 1;

        return matchesSearch && matchesStatus;
    });
}

function renderCategoryTable() {
    const tbody = document.getElementById("category-table-body");
    if (!tbody) return;

    const filtered = getFilteredCategories();

    tbody.innerHTML = "";

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:20px; color: var(--muted); font-weight:600;">
                    No categories found.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(cat => {
        const isActive = Number(cat.is_active) === 1;

        const tr = document.createElement("tr");
        if (!isActive) tr.classList.add("row-inactive");

        tr.innerHTML = `
            <td>${cat.id}</td>
            <td>
                <img class="category-img" src="${getCategoryImage(cat.image_url)}" alt="${cat.name || "Category"}">
            </td>
            <td class="category-name-cell" title="${cat.name || ""}">${cat.name || "-"}</td>
            <td>${cat.sort_order ?? "-"}</td>
            <td class="status-cell ${isActive ? "active" : "inactive"}">${isActive ? "Active" : "Inactive"}</td>
            <td class="action-icon">
                <div class="view-icon action-btn" data-id="${cat.id}" title="View">
                    <i class="ri-list-check"></i>
                </div>
                <div class="edit-icon action-btn" data-id="${cat.id}" title="Update">
                    <i class="ri-edit-2-fill"></i>
                </div>
                ${
                    isActive
                        ? `<div class="disable-icon action-btn" data-id="${cat.id}" title="Disable">
                                <i class="ri-prohibited-2-line"></i>
                           </div>`
                        : `<div class="enable-icon action-btn" data-id="${cat.id}" title="Enable">
                                <i class="ri-loop-left-line"></i>
                           </div>`
                }
            </td>
        `;

        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".view-icon").forEach(btn => {
        btn.addEventListener("click", () => openViewCategoryModal(Number(btn.dataset.id)));
    });

    tbody.querySelectorAll(".edit-icon").forEach(btn => {
        btn.addEventListener("click", () => openUpdateCategoryModal(Number(btn.dataset.id)));
    });

    tbody.querySelectorAll(".disable-icon").forEach(btn => {
        btn.addEventListener("click", () => confirmToggleCategory(Number(btn.dataset.id), false));
    });

    tbody.querySelectorAll(".enable-icon").forEach(btn => {
        btn.addEventListener("click", () => confirmToggleCategory(Number(btn.dataset.id), true));
    });
}

// ---------- View / update fill ----------
function openViewCategoryModal(id) {
    const cat = categoriesById.get(Number(id));
    if (!cat) return;

    document.getElementById("view-category-name").textContent = cat.name || "-";
    document.getElementById("view-category-id").textContent = cat.id ?? "-";
    document.getElementById("view-category-sort").textContent = cat.sort_order ?? "-";
    document.getElementById("view-created-at").textContent = formatDateTime(cat.created_at);
    document.getElementById("view-updated-at").textContent = formatDateTime(cat.updated_at);

    const statusEl = document.getElementById("view-category-status");
    const isActive = Number(cat.is_active) === 1;
    statusEl.textContent = isActive ? "Active" : "Inactive";
    statusEl.className = `cbadge status ${isActive ? "active" : "inactive"}`;

    setImagePreview("viewCategoryImagePreview", getCategoryImage(cat.image_url), "ri-camera-4-fill");

    document.getElementById("viewModal")?.classList.add("active");
}

function openUpdateCategoryModal(id) {
    const cat = categoriesById.get(Number(id));
    if (!cat) return;

    clearFormError("updateError");

    document.getElementById("update-id").value = cat.id;
    document.getElementById("update-category-name").value = cat.name || "";
    document.getElementById("update-category-sort-order").value = cat.sort_order ?? "";
    document.getElementById("update-category-image-upload").value = "";
    setImagePreview("updateCategoryImagePreview", getCategoryImage(cat.image_url));

    document.getElementById("updateModal")?.classList.add("active");
}

// ---------- Create / update / status ----------
async function createCategory() {
    clearFormError("createError");

    const name = document.getElementById("category-name").value.trim();
    const sortOrder = document.getElementById("category-sort-order").value.trim();
    const imageFile = document.getElementById("category-image-upload").files[0];

    if (!name) {
        showFormError("createError", "Category name is required.");
        return;
    }

    if (sortOrder === "") {
        showFormError("createError", "Sort order is required.");
        return;
    }

    if (!imageFile) {
        showFormError("createError", "Category image is required.");
        return;
    }

    openConfirm({
        title: "Create category",
        message: `Are you sure you want to create "${name}"?`,
        confirmClass: "createConfirm",
        onConfirm: async () => {
            const formData = new FormData();
            formData.append("name", name);
            formData.append("sort_order", sortOrder);
            formData.append("image", imageFile);

            await apiFetch(`${API_BASE}/api/categories`, {
                method: "POST",
                body: formData
            });

            closeCreateCategoryModal();
            await loadCategories();
            showToast("Category created successfully.", "success");
        }
    });
}

async function updateCategory() {
    clearFormError("updateError");

    const id = document.getElementById("update-id").value;
    const name = document.getElementById("update-category-name").value.trim();
    const sortOrder = document.getElementById("update-category-sort-order").value.trim();
    const imageFile = document.getElementById("update-category-image-upload").files[0];

    if (!name) {
        showFormError("updateError", "Category name is required.");
        return;
    }

    if (sortOrder === "") {
        showFormError("updateError", "Sort order is required.");
        return;
    }

    openConfirm({
        title: "Update category",
        message: `Are you sure you want to update "${name}"?`,
        confirmClass: "updateConfirm",
        onConfirm: async () => {
            const formData = new FormData();
            formData.append("name", name);
            formData.append("sort_order", sortOrder);

            if (imageFile) {
                formData.append("image", imageFile);
            }

            await apiFetch(`${API_BASE}/api/categories/${id}`, {
                method: "POST",
                body: formData
            });

            closeUpdateCategoryModal();
            await loadCategories();
            showToast("Category updated successfully.", "success");
        }
    });
}

function confirmToggleCategory(id, nextState) {
    const cat = categoriesById.get(Number(id));
    if (!cat) return;

    openConfirm({
        title: nextState ? "Enable category" : "Disable category",
        message: `Are you sure you want to ${nextState ? "enable" : "disable"} "${cat.name}"?`,
        confirmClass: nextState ? "enableConfirm" : "disableConfirm",
        onConfirm: async () => {
            await apiFetch(`${API_BASE}/api/categories/${id}/status`, {
                method: "PATCH",
                body: JSON.stringify({
                    is_active: nextState ? 1 : 0
                })
            });

            await loadCategories();
            showToast(
                nextState ? "Category enabled successfully." : "Category disabled successfully.",
                nextState ? "success" : "warning"
            );
        }
    });
}

function closeTopModalOnEscape() {
    const confirmModal = document.getElementById("confirmModal");
    const updateModal = document.getElementById("updateModal");
    const viewModal = document.getElementById("viewModal");
    const createModal = document.getElementById("createModal");

    if (confirmModal?.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (updateModal?.classList.contains("active")) {
        closeUpdateCategoryModal();
        return;
    }

    if (viewModal?.classList.contains("active")) {
        closeViewCategoryModal();
        return;
    }

    if (createModal?.classList.contains("active")) {
        closeCreateCategoryModal();
    }
}

// ---------- DOM ----------
document.addEventListener("DOMContentLoaded", async () => {
    const admin = window.__AUTH_READY__
        ? await window.__AUTH_READY__
        : window.__ADMIN__;

    if (!admin) return;

    const ok = requireRole(admin, ["superadmin", "manager"]);
    if (!ok) return;

    bindImagePreview("category-image-upload", "categoryImagePreview");
    bindImagePreview("update-category-image-upload", "updateCategoryImagePreview");

    document.getElementById("categorySearch")?.addEventListener("input", () => {
        renderCategoryTable();
    });

    document.getElementById("showAllCategories")?.addEventListener("change", () => {
        renderCategoryTable();
    });

    document.getElementById("createCategoryBtn")?.addEventListener("click", createCategory);
    document.getElementById("updateCategoryBtn")?.addEventListener("click", updateCategory);

    document.getElementById("createModal")?.addEventListener("click", (e) => {
        if (e.target.id === "createModal") closeCreateCategoryModal();
    });

    document.getElementById("viewModal")?.addEventListener("click", (e) => {
        if (e.target.id === "viewModal") closeViewCategoryModal();
    });

    document.getElementById("updateModal")?.addEventListener("click", (e) => {
        if (e.target.id === "updateModal") closeUpdateCategoryModal();
    });

    document.getElementById("confirmModal")?.addEventListener("click", (e) => {
        if (e.target.id === "confirmModal") closeConfirm();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeTopModalOnEscape();
        }
    });

    try {
        await loadCategories();
    } catch (err) {
        console.error("Load categories error:", err);
        showToast(err.message || "Failed to load categories.", "error");
    }
});