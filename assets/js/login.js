const API_BASE = window.API_BASE;

function setAuth(token, admin, remember) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem("admin_token", token);
    store.setItem("admin_profile", JSON.stringify(admin));

    (remember ? sessionStorage : localStorage).removeItem("admin_token");
    (remember ? sessionStorage : localStorage).removeItem("admin_profile");
}

function getToken() {
    return localStorage.getItem("admin_token") || sessionStorage.getItem("admin_token");
}

async function warmUpApi() {
    try {
        await fetch(`${API_BASE}/api/health`, {
            method: "GET",
            cache: "no-store"
        });
        return true;
    } catch {
        return false;
    }
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

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");
    if (!form) return;

    const statusEl = document.getElementById("loginStatus");

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
        btn.textContent = "Connecting to server...";

        if (statusEl) {
            statusEl.textContent = "Free hosting may take 20–30 seconds to wake up.";
            statusEl.className = "login-status info";
        }

        try {
            await warmUpApi();
            btn.textContent = "Logging in...";

            const result = await loginAdmin(login, password, remember);

            if (!result.ok) {
                if (statusEl) {
                    statusEl.textContent = result.message;
                    statusEl.className = "login-status error";
                }
                else {
                    alert(result.message);
                }
                return;
            }

            if (statusEl) {
                statusEl.textContent = "Login successful! Redirecting...";
                statusEl.className = "login-status info";
            }
            
            window.location.href = "index.html";
        } finally {
            btn.disabled = false;
            btn.textContent = "Login";
        }
    });
});