const API_BASE = "http://127.0.0.1:8000";
// ✅ one shared promise so every page waits the same auth request
window.__AUTH_READY__ = null;

function getToken() {
    return localStorage.getItem("admin_token") || sessionStorage.getItem("admin_token");
}

function getRole(admin) {
    return String(admin?.role || "").toLowerCase();
}

async function requireAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = "login.html";
        return null;
    }

    // ✅ quick cache
    const cached = sessionStorage.getItem("admin_cache");
    const cachedAt = Number(sessionStorage.getItem("admin_cache_at") || 0);
    const fresh = Date.now() - cachedAt < 60_000; // 60 seconds

    if (cached && fresh) {
        // validate in background (doesn't block)
        fetchMe(token).then((admin) => {
            if (admin) {
                sessionStorage.setItem("admin_cache", JSON.stringify(admin));
                sessionStorage.setItem("admin_cache_at", String(Date.now()));
            }
        }).catch(() => {});
        return JSON.parse(cached);
    }

    const admin = await fetchMe(token);
    if (!admin) return null;

    sessionStorage.setItem("admin_cache", JSON.stringify(admin));
    sessionStorage.setItem("admin_cache_at", String(Date.now()));
    return admin;
}

async function fetchMe(token) {
    const res = await fetch(`${API_BASE}/api/admin/me`, {
        headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`
        }
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        logoutLocal();
        return null;
    }

    return json.admin;
}

function logoutLocal() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "login.html";
}

async function logoutAdmin() {
    const token = getToken();
    if (!token) return logoutLocal();

    await fetch(`${API_BASE}/api/admin/logout`, {
        method: "POST",
        headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
        }
    });

    logoutLocal();
}

function blockNoPermission({ title, message }) {
    const main = document.querySelector(".main-content");
    if (main) main.style.display = "none";

    // create overlay if not exist
    let overlay = document.getElementById("noPermissionOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "noPermissionOverlay";
        overlay.innerHTML = `
        <div class="np-card">
            <div class="np-icon"><i class="ri-lock-2-line"></i></div>
            <h2 class="np-title"></h2>
            <p class="np-msg"></p>
            <button class="np-btn" type="button">Back to Dashboard</button>
        </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector(".np-btn").addEventListener("click", () => {
        window.location.href = "index.html";
        });
    }

    overlay.querySelector(".np-title").textContent = title || "Access denied";
    overlay.querySelector(".np-msg").textContent =
        message || "You don’t have permission to access this section.";
}

function requireRole(admin, roles = []) {
    const role = String(admin?.role || "").toLowerCase();
    const ok = roles.map(r => String(r).toLowerCase()).includes(role);

    if (!ok) {
        blockNoPermission({
            title: "No permission",
            message: "You don’t have permission to access this page."
        });
        return false;
    }
    return true;
}

function applyRoleUI(role) {
    const roleTabs = {
        superadmin: ["dashboard", "orders", "products", "categories", "promotions", "delivery", "customers", "payments", "admins"],
        manager:    ["dashboard", "orders", "products", "categories", "promotions", "delivery", "customers", "payments", "admins"], // admins view-only later
        operator:   ["dashboard", "orders", "products", "delivery", "customers"],
    };

    const allowed = new Set(roleTabs[role] || roleTabs.operator);

    const nodes = {
        dashboard: document.getElementById("liDashboard"),
        orders: document.getElementById("liOrders"),
        products: document.getElementById("liProducts"),
        categories: document.getElementById("liCategories"),
        promotions: document.getElementById("liPromotions"),
        delivery: document.getElementById("liDelivery"),
        customers: document.getElementById("liCustomers"),
        payments: document.getElementById("liPayments"),
        admins: document.getElementById("liAdmins"),
    };

    Object.entries(nodes).forEach(([key, el]) => {
        if (!el) return;
        el.style.display = allowed.has(key) ? "" : "none";
    });

    // Optional: show better role label
    const roleLabel = {
        superadmin: "Super Admin",
        manager: "Manager",
        operator: "Operator",
    };
    const roleEl = document.getElementById("sidebarRole");
    if (roleEl) roleEl.textContent = roleLabel[role] || role;
}

document.addEventListener("DOMContentLoaded", () => {
    // 1) instant UI
    setupTheme();
    wireDropdown();
    // 2) shared auth promise (so other scripts can await it)
    window.__AUTH_READY__ = initAuthAndUI();
});

function wireDropdown() {
    const profileToggle = document.getElementById("profileToggle");
    const dropdown = document.getElementById("profileDropdown");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!profileToggle || !dropdown || !logoutBtn) return;

    function openDropdown() {
        dropdown.classList.add("active");
        profileToggle.classList.add("open");
    }

    function closeDropdown() {
        dropdown.classList.remove("active");
        profileToggle.classList.remove("open");
    }

    function toggleDropdown(e) {
        e.stopPropagation();
        dropdown.classList.contains("active") ? closeDropdown() : openDropdown();
    }

    profileToggle.addEventListener("click", toggleDropdown);
    dropdown.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", closeDropdown);
    logoutBtn.addEventListener("click", logoutAdmin);
}

async function initAuthAndUI() {
    const admin = await requireAuth();
    window.__ADMIN__ = admin;
    if (!admin) return;

    const usernameEl = document.getElementById("sidebarUsername");
    const roleEl = document.getElementById("sidebarRole");
    const imgEl = document.getElementById("sidebarProfileImage");

    if (usernameEl) usernameEl.textContent = admin.username;
    if (roleEl) roleEl.textContent = admin.role;

    if (imgEl && admin.profile_url) {
        imgEl.src = admin.profile_url;
    }

    applyRoleUI((admin.role || "").toLowerCase());

    return admin;
}

function setupTheme() {
    const btn = document.getElementById("toggleTheme");
    // const icon = btn.querySelector("i");

    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.dataset.theme = saved;
    updateThemeButton(saved);

    btn.addEventListener("click", (e) => {
        e.stopPropagation(); // don’t close dropdown
        const current = document.documentElement.dataset.theme || "light";
        const next = current === "dark" ? "light" : "dark";

        document.documentElement.dataset.theme = next;
        localStorage.setItem("theme", next);
        updateThemeButton(next);
    });

    function updateThemeButton(theme) {
        const text = theme === "dark" ? "Light Mode" : "Dark Mode";
        btn.innerHTML = `<i class="${theme === "dark" ? "ri-sun-line" : "ri-moon-line"}"></i> ${text}`;
    }
}