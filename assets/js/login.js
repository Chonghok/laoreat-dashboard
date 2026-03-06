const API_BASE = window.API_BASE;

// storage helpers
function setAuth(token, admin, remember) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem("admin_token", token);
    store.setItem("admin_profile", JSON.stringify(admin));

    // optional: clear other storage to avoid “stuck” confusion
    (remember ? sessionStorage : localStorage).removeItem("admin_token");
    (remember ? sessionStorage : localStorage).removeItem("admin_profile");
}

function getToken() {
    return localStorage.getItem("admin_token") || sessionStorage.getItem("admin_token");
}

async function loginAdmin(login, password, remember) {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
        login,
        password,
        device_name: "dashboard-web"
        })
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        return { ok: false, message: json?.message || "Login failed" };
    }

    setAuth(json.token, json.admin, remember);
    return { ok: true };
}

// handle form
document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");
    if (!form) return;

    // OPTIONAL: if already logged in, go to admin page
    const token = getToken();
    if (token) {
        window.location.href = "index.html";
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const login = document.getElementById("login").value.trim();
        const password = document.getElementById("password").value;
        const remember = document.getElementById("remember").checked;

        const btn = form.querySelector("button[type='submit']");
        btn.disabled = true;
        btn.textContent = "Logging in...";

        try {
        const result = await loginAdmin(login, password, remember);
        if (!result.ok) {
            alert(result.message);
            return;
        }
        window.location.href = "index.html";
        } finally {
            btn.disabled = false;
            btn.textContent = "Login";
        }
    });
});