let adminsById = new Map();
let adminsAll = [];

// Show form error message
function showFormError(message) {
    const box = document.getElementById("createError");
    box.textContent = message;
    box.style.display = "block";
}

function clearFormError() {
    const box = document.getElementById("createError");
    box.textContent = "";
    box.style.display = "none";
}


// Show toast notification
let toastTimer;
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
    }, 2500);
}

// Format datetime string to "DD MMM YYYY • HH:MM AM/PM"
function formatDateTime(datetimeString) {
    if (!datetimeString) return "-";

    const date = new Date(datetimeString.replace(" ", "T"));

    const datePart = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);

    const timePart = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(date).toLowerCase();

    return `
        <div class="date-line">${datePart}</div>
        <div class="time-line">${timePart}</div>
    `;
}

function viewerRole() {
    return String(window.__ADMIN__?.role || "").toLowerCase();
}

function viewerId() {
    return String(window.__ADMIN__?.id || "");
}

function canManageTargetAdmin(targetAdmin) {
    const vRole = viewerRole();
    const vId = viewerId();

    const tRole = String(targetAdmin?.role || "").toLowerCase();
    const tId = String(targetAdmin?.id || "");

    const isSelf = vId && tId && vId === tId;

    if (vRole === "superadmin") return true;

    if (vRole === "manager") {
        // ✅ manager can manage operators
        if (tRole === "operator") return true;

        // ✅ manager can edit/view themselves
        if (isSelf) return true;

        // ❌ manager cannot manage other managers/superadmin
        return false;
    }

    return false; // operator
}





// Create Modal
const modalOverlay = document.getElementById("createModal");

function openModal() {
    modalOverlay.classList.add("active");
    const modal = modalOverlay.querySelector(".modal");
    modal.scrollTop = 0;
}

function closeModal() {
    modalOverlay.classList.remove("active");
    setTimeout(() => resetCreateModal(), 300) ;
}

/* Close when clicking outside modal */
modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});



const fileInput = document.getElementById("profile-upload");
const imagePreview = document.getElementById("imagePreview");

fileInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        imagePreview.innerHTML = `
            <img src="${e.target.result}" alt="Profile">
        `;
    };
    reader.readAsDataURL(file);
});

// Collect form data for submission
function getCreateAdminData() {
    return {
        username: document.getElementById("username").value.trim(),
        role: document.getElementById("admin-role").value,
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        confirmPassword: document.getElementById("confirm-password").value,
        profileImage: document.getElementById("profile-upload").files[0] || null
    };
}

// Validate form data before submission
function validateCreateAdmin(data) {
    clearFormError();

    if (!data.username || !data.email || !data.password) {
        showFormError("Please fill in all required fields.");
        return false;
    }

    if (data.password !== data.confirmPassword) {
        showFormError("Passwords do not match.");
        return false;
    }

    return true;
}

// Handle form submission
function confirmCreateAdmin(e) {
    if(e) e.preventDefault(); 
    const data = getCreateAdminData();
    if (!validateCreateAdmin(data)) return;

    openConfirm({
        title: "Create Admin",
        message: "Are you sure you want to create this admin?",
        type: "createConfirm",
        onConfirm: () => createAdmin(data)
    });
}

// POST request to create admin
async function createAdmin(data) {
    const formData = new FormData();
    formData.append("username", data.username);
    formData.append("role", data.role);
    formData.append("email", data.email);
    formData.append("password", data.password);

    if (data.profileImage) {
        formData.append("profile", data.profileImage);
    }

    try {
        const res = await fetch(`${API_BASE}/api/create-admin`, {
            method: "POST",
            headers: { 
                "Accept": "application/json",
                "Authorization": `Bearer ${getToken()}`
            },
            body: formData
        });
        const result = await res.json().catch(() => null);
        
        if (!res.ok) {
            console.error("Create admin failed:", res.status, result);
            if (result && result.errors) {
                const firstError = Object.values(result.errors)[0][0] || "Validation error";
                showFormError(firstError);
            } else {
                showFormError(result?.message || "Failed to create admin");
            }

            showToast(result?.message || "Failed to create admin", "error");
            return false;
        }

        clearFormError();
        showToast("Admin created successfully");

        closeConfirm();
        closeModal();
        resetCreateModal();

        await refreshAdminsTable();

        return true;

    } catch (err) {
        console.error("Network/JS error:", err);
        showFormError("Network error. Make sure Laravel is running.");
        showToast("Network error", "error");
        return false;
    }
}

// Reset form fields and preview
function resetCreateModal() {
    document.getElementById("username").value = "";
    const roleSelect = document.getElementById("admin-role");
    roleSelect.selectedIndex = 0;
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("confirm-password").value = "";
    document.getElementById("profile-upload").value = "";
    document.getElementById("imagePreview").innerHTML = '<i class="ri-camera-4-fill"></i>';
    document.querySelector("#createModal .modal").scrollTop = 0;
}

function applyAdminPageRoleLimits() {
    const v = viewerRole();
    const roleSelect = document.getElementById("admin-role");
    if (!roleSelect) return;

    if (v === "manager") {
        // allow only operator creation
        [...roleSelect.options].forEach(opt => {
        opt.disabled = opt.value !== "operator";
        });
        roleSelect.value = "operator";
    }
}




// Show all admins on page load
function roleLabel(role) {
    if (role === "superadmin") return "Super Admin";
    if (role === "manager") return "Manager";
    if (role === "operator") return "Operator";
    return role;
}

function actionIcons(admin) {
    const id = String(admin.id);
    const isSelf = id === viewerId();

    const canManage = canManageTargetAdmin(admin);

    const viewBtn = `
        <div class="view-icon action-btn" data-id="${id}" title="View">
        <i class="ri-list-check"></i>
        </div>`;

    // if cannot manage at all -> view only
    if (!canManage) return viewBtn;

    const editBtn = `
        <div class="edit-icon action-btn" data-id="${id}" title="Update">
        <i class="ri-edit-2-fill"></i>
        </div>`;

    // ✅ never allow disable/enable yourself (everyone)
    if (isSelf) return viewBtn + editBtn;

    // now toggles are allowed only if canManage is true AND not self
    const toggle = Number(admin.is_active) === 1
        ? `<div class="disable-icon action-btn" data-id="${id}" title="Disable">
            <i class="ri-prohibited-2-line"></i>
        </div>`
        : `<div class="enable-icon action-btn" data-id="${id}" title="Enable">
            <i class="ri-loop-left-line"></i>
        </div>`;

    return viewBtn + editBtn + toggle;
}

function loadAdminTable(admins) {
    const tbody = document.getElementById("admin-table-body");
    if (!tbody) return;

    let html = "";
    for (const a of admins) {
        const rowClass = Number(a.is_active) === 1 ? "" : "row-inactive";
        html += `
            <tr class="${rowClass}">
                <td>${a.id}</td>
                <td><img src="${a.profile_url}" alt="Profile" loading="lazy"></td>
                <td class="username-cell" title="${a.username}">${a.username}</td>
                <td class="email-cell" title="${a.email}">${a.email}</td>
                <td>${roleLabel(a.role)}</td>
                <td class="${Number(a.is_active) === 1 ? 'statusActive' : 'statusInactive'}">
                    ${Number(a.is_active) === 1 ? 'Active' : 'Inactive'}
                </td>
                <td class="action-icon">
                    ${actionIcons(a)}
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
}

let adminsFetchInFlight = null;

async function fetchAdmins() {
    // ✅ prevent double calls (very common on tab switching / fast reload)
    if (adminsFetchInFlight) return adminsFetchInFlight;

    const cacheKey = "admins_cache";
    const cacheAtKey = "admins_cache_at";
    const cacheTTL = 60_000; // 60s

    const cached = sessionStorage.getItem(cacheKey);
    const cachedAt = Number(sessionStorage.getItem(cacheAtKey) || 0);
    const fresh = Date.now() - cachedAt < cacheTTL;

    // ✅ show cached instantly
    if (cached) {
        try {
            adminsAll = JSON.parse(cached) || [];
            adminsById = new Map(adminsAll.map(a => [String(a.id), a]));
            applyFilters();
        } catch {}
    }

    // ✅ if cache is fresh, refresh in background (don’t block UI)
    if (cached && fresh) {
        fetchAdminsFromApi().catch(() => {});
        return;
    }

    // otherwise do normal fetch (blocking)
    adminsFetchInFlight = fetchAdminsFromApi().finally(() => {
        adminsFetchInFlight = null;
    });

    return adminsFetchInFlight;

    async function fetchAdminsFromApi() {
        try {
            const token = getToken();

            const res = await fetch(`${API_BASE}/api/get-admins`, {
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.success) {
                console.error("Failed to fetch admins:", json);
                showToast(json?.message || "Failed to load admins", "error");
                return;
            }

            adminsAll = json.data || [];
            adminsById = new Map(adminsAll.map(a => [String(a.id), a]));

            // ✅ store cache
            sessionStorage.setItem(cacheKey, JSON.stringify(adminsAll));
            sessionStorage.setItem(cacheAtKey, String(Date.now()));

            applyFilters();
        } catch (err) {
            console.error("Fetch admins error:", err);
            showToast("Network error loading admins", "error");
        }
    }
}

async function refreshAdminsTable() {
    await fetchAdmins();
}





// View Modal
const viewOverlay = document.getElementById("viewModal");

function openViewModal() {
  viewOverlay.classList.add("active");
  viewOverlay.querySelector(".modal").scrollTop = 0;
}

function closeViewModal() {
  viewOverlay.classList.remove("active");
}

// close when clicking outside
viewOverlay.addEventListener("click", (e) => {
  if (e.target === viewOverlay) closeViewModal();
});

function fillViewModal(a) {
    const imgUrl = a.profile_url;

    // header
    document.getElementById("view-username").textContent = a.username ?? "-";
    document.getElementById("view-id").textContent = a.id ?? "-";

    const roleLabelText = roleLabel(a.role) ?? "-";
    document.getElementById("view-role").textContent = roleLabelText;

    const active = Number(a.is_active) === 1;
    const statusEl = document.getElementById("view-status");
    statusEl.textContent = active ? "Active" : "Inactive";
    statusEl.classList.remove("active", "inactive");
    statusEl.classList.add(active ? "active" : "inactive");

    // details
    document.getElementById("view-email").textContent = a.email ?? "-";
    document.getElementById("view-created-at").innerHTML = formatDateTime(a.created_at);
    document.getElementById("view-updated-at").innerHTML = formatDateTime(a.updated_at);

    // profile preview + link
    const preview = document.getElementById("viewImagePreview");
    preview.innerHTML = `<img src="${imgUrl}" alt="Profile">`;
    const img = preview.querySelector("img");
    img.onerror = () => { img.src = defaultImg; };
}

document.addEventListener("DOMContentLoaded", async () => {
    const admin = window.__AUTH_READY__
        ? await window.__AUTH_READY__
        : window.__ADMIN__;

    if (!admin) return;

    const ok = requireRole(admin, ["superadmin", "manager"]);
    if (!ok) return;

    applyAdminPageRoleLimits();

    const createBtn = document.querySelector(".btn-create");
    if (createBtn) {
        const v = viewerRole();
        createBtn.style.display = (v === "superadmin" || v === "manager") ? "" : "none";
    }

    // copy email button (keep your code)
    const copyEmailBtn = document.getElementById("copyEmailBtn");
    if (copyEmailBtn) {
        copyEmailBtn.addEventListener("click", async () => {
            const email = document.getElementById("view-email")?.textContent?.trim();
            if (!email || email === "-") return;

            try {
                await navigator.clipboard.writeText(email);
                showToast("Email copied!");
            } catch (e) {
                const temp = document.createElement("textarea");
                temp.value = email;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand("copy");
                document.body.removeChild(temp);
                showToast("Email copied!");
            }
        });
    }

    fetchAdmins();

    // filters
    const showAllEl = document.getElementById("showAllAdmins");
    const roleEl = document.getElementById("roleFilter");
    const searchEl = document.getElementById("adminSearch");

    if (showAllEl) showAllEl.addEventListener("change", applyFilters);
    if (roleEl) roleEl.addEventListener("change", applyFilters);
    if (searchEl) searchEl.addEventListener("input", applyFilters);

    // table click delegation (keep your code)
    const tbody = document.getElementById("admin-table-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".action-btn");
        if (!btn) return;

        const id = btn.dataset.id;

        if (btn.classList.contains("view-icon")) {
            const a = adminsById.get(String(id));
            if (!a) return showToast("Admin not found", "error");
            fillViewModal(a);
            openViewModal();
            return;
        }

        if (btn.classList.contains("edit-icon")) {
            const a = adminsById.get(String(id));
            if (!a) return showToast("Admin not found", "error");
            fillUpdateModal(a);
            openUpdateModal();
            return;
        }

        if (btn.classList.contains("disable-icon")) {
            openConfirm({
                title: "Disable Admin",
                message: "Disable this admin? They won’t be able to access the dashboard.",
                type: "disableConfirm",
                onConfirm: () => setAdminStatus(id, 0),
            });
            return;
        }

        if (btn.classList.contains("enable-icon")) {
            openConfirm({
                title: "Enable Admin",
                message: "Enable this admin?",
                type: "enableConfirm",
                onConfirm: () => setAdminStatus(id, 1),
            });
            return;
        }
    });
});






// Update Modal
const updateOverlay = document.getElementById("updateModal");

function openUpdateModal() {
  updateOverlay.classList.add("active");
  updateOverlay.querySelector(".modal").scrollTop = 0;
}

function closeUpdateModal() {
  updateOverlay.classList.remove("active");
  clearUpdateError();
}

// click outside to close
if (updateOverlay) {
    updateOverlay.addEventListener("click", (e) => {
        if (e.target === updateOverlay) closeUpdateModal();
    });
}

// update preview
const updateFileInput = document.getElementById("update-profile-upload");
const updateImagePreview = document.getElementById("updateImagePreview");

if (updateFileInput && updateImagePreview) {
    updateFileInput.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        // user selected new photo -> cancel "remove" flag
        document.getElementById("update-remove-photo").value = "0";

        const reader = new FileReader();
        reader.onload = function (e) {
            updateImagePreview.innerHTML = `<img src="${e.target.result}" alt="Profile">`;
        };
        reader.readAsDataURL(file);
    });
}

function removeUpdatePhoto() {
    // set flag for backend
    document.getElementById("update-remove-photo").value = "1";

    // clear chosen file (if any)
    const input = document.getElementById("update-profile-upload");
    if (input) input.value = "";

    // set preview to default icon or default image        
    const defaultImg = "https://res.cloudinary.com/ddtls0ctx/image/upload/v1771673412/default-user_wxewnc.webp";
    updateImagePreview.innerHTML = `<img src="${defaultImg}" alt="Default Profile">`;
}

// errors
function showUpdateError(message) {
    const box = document.getElementById("updateError");
    if (!box) return;
    box.textContent = message;
    box.style.display = "block";
}
function clearUpdateError() {
    const box = document.getElementById("updateError");
    if (!box) return;
    box.textContent = "";
    box.style.display = "none";
}
function fillUpdateModal(a) {
    const imgUrl = a.profile_url;

    document.getElementById("update-id").value = a.id;
    document.getElementById("update-username").value = a.username || "";
    document.getElementById("update-email").value = a.email || "";
    document.getElementById("update-admin-role").value = a.role || "operator";

    // reset password fields
    document.getElementById("update-password").value = "";
    document.getElementById("update-confirm-password").value = "";

    // reset upload/remove state
    document.getElementById("update-profile-upload").value = "";
    document.getElementById("update-remove-photo").value = "0";

    // show current photo
    updateImagePreview.innerHTML = `<img src="${imgUrl}" alt="Profile">`;
    const img = updateImagePreview.querySelector("img");
    img.onerror = () => { img.src = defaultImg; };

    clearUpdateError();
}

function getUpdateAdminData() {
    return {
        id: document.getElementById("update-id").value,
        username: document.getElementById("update-username").value.trim(),
        role: document.getElementById("update-admin-role").value,
        email: document.getElementById("update-email").value.trim(),
        password: document.getElementById("update-password").value,
        confirmPassword: document.getElementById("update-confirm-password").value,
        profileImage: document.getElementById("update-profile-upload").files[0] || null,
        removePhoto: document.getElementById("update-remove-photo").value === "1"
    };
}

function validateUpdateAdmin(data) {
    clearUpdateError();

    if (!data.username || !data.email) {
        showUpdateError("Username and email are required.");
        return false;
    }

    // only validate passwords if they typed something
    if (data.password || data.confirmPassword) {
        if (data.password !== data.confirmPassword) {
            showUpdateError("Passwords do not match.");
            return false;
        }
        if (data.password.length < 4) {
            showUpdateError("Password must be at least 4 characters.");
            return false;
        }
    }

    return true;
}

function confirmUpdateAdmin(e) {
    if (e) e.preventDefault();

    const data = getUpdateAdminData();
    if (!validateUpdateAdmin(data)) return;

    openConfirm({
        title: "Update Admin",
        message: "Save changes to this admin?",
        type: "updateConfirm",
        onConfirm: () => updateAdmin(data)
    });
}

async function updateAdmin(data) {
    const formData = new FormData();
    formData.append("username", data.username);
    formData.append("role", data.role);
    formData.append("email", data.email);

    // only send password if user typed it
    if (data.password) formData.append("password", data.password);

        if (data.removePhoto) {
            formData.append("remove_photo", "1");
        }

    if (data.profileImage) formData.append("profile", data.profileImage);

    try {
        const res = await fetch(`${API_BASE}/api/admins/${data.id}`, {
            method: "POST", // or PUT if you set it up (some hosts block PUT)
            headers: { 
                "Accept": "application/json",
                "Authorization": `Bearer ${getToken()}`
            },
            body: formData
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            showUpdateError(json?.message || "Failed to update admin");
            showToast("Update failed", "error");
            return false;
        }

        showToast("Admin updated successfully");
        closeConfirm();
        closeUpdateModal();
        await refreshAdminsTable();
        return true;
    } catch (err) {
        console.error(err);
        showUpdateError("Network error updating admin");
        showToast("Network error", "error");
        return false;
    }
}


// Enable/Disable Admin
async function setAdminStatus(id, isActive) {
    try {
        const res = await fetch(`${API_BASE}/api/admins/${id}/status`, {
            method: "PATCH",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getToken()}`
            },
            body: JSON.stringify({ is_active: String(isActive) })
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            showToast(json?.message || "Failed to update status", "error");
            return false;
        }

        // 👇 Better message logic
        if (Number(isActive) === 1) {
            showToast("Admin enabled successfully", "success");
        } else {
            showToast("Admin disabled", "warning");
        }
        
        closeConfirm();
        await refreshAdminsTable(); // pulls latest
        return true;
    } catch (err) {
        console.error(err);
        showToast("Network error updating status", "error");
        return false;
    }
}







// Search Bar and Filters
function applyFilters() {
    const search = (document.getElementById("adminSearch")?.value || "").trim().toLowerCase();
    const role = document.getElementById("roleFilter")?.value || "all";
    const showAll = document.getElementById("showAllAdmins")?.checked || false;

    let filtered = adminsAll;

    // role filter
    if (role !== "all") {
        filtered = filtered.filter(a => (a.role || "").toLowerCase() === role);
    }

    // status behavior:
    // unchecked -> only active
    // checked -> show both active + inactive
    if (!showAll) {
        filtered = filtered.filter(a => Number(a.is_active) === 1);
    }

    // search by id/username/email
    if (search) {
        filtered = filtered.filter(a => {
        const idStr = String(a.id || "");
        const username = (a.username || "").toLowerCase();
        const email = (a.email || "").toLowerCase();
        return idStr.includes(search) || username.includes(search) || email.includes(search);
        });
    }

    loadAdminTable(filtered);
}








// Cache Confirmation Modal Elemnents
const confirmOverlay = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelConfirm");
let confirmAction = null;

// Open confirmation modal
function openConfirm({ title, message, type = "createConfirm", onConfirm }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmBtn.className = 'confirm-btn ' + type;
    confirmAction = onConfirm;
    confirmOverlay.classList.add("active");
}
function closeConfirm() {
    confirmOverlay.classList.remove("active");
    confirmAction = null;
}

confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) {
        closeConfirm();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (confirmOverlay.classList.contains("active")) {
        closeConfirm();
        return;
    }

    if (viewOverlay.classList.contains("active")) {
        closeViewModal();
        return;
    }

    if (updateOverlay.classList.contains("active")) {
        closeUpdateModal();
        return;
    }

    if (modalOverlay.classList.contains("active")) {
        closeModal();
    }
});

confirmBtn.addEventListener("click", async () => {
    if (typeof confirmAction !== "function") return;

    confirmBtn.disabled = true;

    try {
        const ok = await confirmAction();  // waits properly if you RETURN the promise
    } finally {
        confirmBtn.disabled = false;
    }
});
cancelBtn.addEventListener("click", closeConfirm);
