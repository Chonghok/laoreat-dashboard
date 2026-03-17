const DASHBOARD_ENDPOINT = `${API_BASE}/api/admin/dashboard`;
let dashboardDataCache = null;

let orderStatusChart = null;
let paymentStatusChart = null;
let deliveryTypeChart = null;
let trendChart = null;

document.addEventListener("DOMContentLoaded", async () => {
    await window.__AUTH_READY__;
    if (!window.__ADMIN__) return;

    loadDashboard();

    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadDashboard);
    }
});

async function loadDashboard() {
    const token = getToken();
    if (!token) return;

    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<i class="ri-loader-4-line"></i> Refreshing...`;
    }

    try {
        const res = await fetch(DASHBOARD_ENDPOINT, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            throw new Error(json?.message || "Failed to load dashboard.");
        }

        dashboardDataCache = json;

        renderSummaryCards(json.summary || {});
        renderOrderStatusChart(json.order_statuses || []);
        renderPaymentStatusChart(json.payment_statuses || []);
        renderDeliveryTypeChart(json.delivery_type_usage || []);
        renderTrendChart(json.last_7_days || []);
        renderRecentOrders(json.recent_orders || []);
    } catch (error) {
        renderDashboardError(error.message || "Something went wrong.");
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<i class="ri-refresh-line"></i> Refresh`;
        }
    }
}

function renderSummaryCards(summary) {
    const wrap = document.getElementById("summaryCards");
    if (!wrap) return;

    const cards = [
        {
            label: "Total Orders",
            value: formatNumber(summary.total_orders || 0),
            note: `${formatNumber(summary.orders_today || 0)} today`,
            icon: "ri-file-list-3-line",
            colorClass: "card-blue"
        },
        {
            label: "Paid Revenue",
            value: formatCurrency(summary.paid_revenue || 0),
            note: `${formatCurrency(summary.revenue_today || 0)} today`,
            icon: "ri-money-dollar-circle-line",
            colorClass: "card-green"
        },
        {
            label: "Active Customers",
            value: formatNumber(summary.active_customers || 0),
            note: `${formatNumber(summary.new_customers_today || 0)} joined today`,
            icon: "ri-user-smile-line",
            colorClass: "card-purple"
        },
        {
            label: "Active Products",
            value: formatNumber(summary.active_products || 0),
            note: `${formatNumber(summary.active_promotions || 0)} active promotions`,
            icon: "ri-store-2-line",
            colorClass: "card-orange"
        }
    ];

    wrap.innerHTML = cards.map(card => `
        <div class="dashboard-card summary-card ${card.colorClass}">
            <div class="summary-top">
                <div>
                    <div class="summary-label">${escapeHtml(card.label)}</div>
                    <div class="summary-value">${escapeHtml(card.value)}</div>
                </div>
                <div class="summary-icon ${card.colorClass}">
                    <i class="${card.icon}"></i>
                </div>
            </div>
            <div class="summary-note">${escapeHtml(card.note)}</div>
        </div>
    `).join("");
}

function renderOrderStatusChart(items) {
    const canvas = document.getElementById("orderStatusChart");
    if (!canvas) return;

    if (orderStatusChart) orderStatusChart.destroy();

    const labels = items.map(item => prettyLabel(item.label));
    const values = items.map(item => Number(item.count || 0));

    orderStatusChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "#4379EE",
                    "#9333EA",
                    "#D97706",
                    "#15DA54",
                    "#0284C7",
                    "#DC2626",
                    "#9CA3AF"
                ],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: getDoughnutOptions()
    });
}

function renderPaymentStatusChart(items) {
    const canvas = document.getElementById("paymentStatusChart");
    if (!canvas) return;

    if (paymentStatusChart) paymentStatusChart.destroy();

    const labels = items.map(item => prettyLabel(item.label));
    const values = items.map(item => Number(item.count || 0));

    paymentStatusChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "#16A34A",
                    "#D97706",
                    "#DC2626",
                    "#4379EE",
                    "#9CA3AF"
                ],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: getDoughnutOptions()
    });
}

function renderDeliveryTypeChart(items) {
    const canvas = document.getElementById("deliveryTypeChart");
    if (!canvas) return;

    if (deliveryTypeChart) deliveryTypeChart.destroy();

    const labels = items.map(item => item.label || "-");
    const values = items.map(item => Number(item.count || 0));

    deliveryTypeChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Orders",
                data: values,
                backgroundColor: "#4379EE",
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: getBarOptions(false)
    });
}

function renderTrendChart(items) {
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;

    if (trendChart) trendChart.destroy();

    const labels = items.map(item => item.label || "-");
    const values = items.map(item => Number(item.orders_count || 0));

    trendChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Orders",
                data: values,
                borderColor: "#4379EE",
                backgroundColor: "rgba(67,121,238,0.12)",
                tension: 0.35,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 5,
                pointBackgroundColor: "#4379EE",
                pointBorderWidth: 0
            }]
        },
        options: getLineOptions()
    });
}

function renderRecentOrders(items) {
    const tbody = document.getElementById("recentOrdersTable");
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">No recent orders found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(order => {
        const paymentBadge = getPaymentBadge(order.payment_status, order.payment_method);
        const statusBadge = getOrderStatusBadge(order.order_status);
        const date = formatDateBlock(order.created_at);

        return `
            <tr>
                <td>
                    <div class="order-code">${escapeHtml(order.order_number || "-")}</div>
                    <div class="order-sub">#${escapeHtml(String(order.id || "-"))}</div>
                </td>
                <td>${escapeHtml(order.customer_name || "-")}</td>
                <td>${formatCurrency(order.total_amount || 0)}</td>
                <td>${paymentBadge}</td>
                <td>${statusBadge}</td>
                <td class="date-cell">
                    <span class="date-main">${escapeHtml(date.date)}</span>
                    <span class="date-sub">${escapeHtml(date.time)}</span>
                </td>
            </tr>
        `;
    }).join("");
}

function getPaymentBadge(paymentStatus, paymentMethod) {
    const status = String(paymentStatus || "").toLowerCase();
    const method = String(paymentMethod || "").toLowerCase();

    if (status === "paid") {
        return `<span class="badge payment paid">Paid</span>`;
    }

    if (status === "failed") {
        return `<span class="badge payment failed">Failed</span>`;
    }

    if (method === "card") {
        return `<span class="badge payment card">Card</span>`;
    }

    return `<span class="badge payment cash">Cash</span>`;
}

function getOrderStatusBadge(statusValue) {
    const key = String(statusValue || "").toLowerCase();
    const label = prettyLabel(key || "other");

    const map = {
        accepted: "accepted",
        preparing: "preparing",
        out_for_delivery: "on_the_way",
        on_the_way: "on_the_way",
        delivered: "delivered",
        picked_up: "picked_up",
        ready_for_pickup: "ready_for_pickup",
        cancelled: "cancelled"
    };

    const cssClass = map[key] || "other";

    return `<span class="badge status ${cssClass}">${escapeHtml(label)}</span>`;
}

function formatDateBlock(value) {
    if (!value) {
        return { date: "-", time: "-" };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return { date: "-", time: "-" };
    }

    const dateText = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(date);

    const timeText = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(date);

    return {
        date: dateText,
        time: timeText
    };
}

function renderDashboardError(message) {
    const ids = [
        "summaryCards",
        "recentOrdersTable"
    ];

    if (orderStatusChart) orderStatusChart.destroy();
    if (paymentStatusChart) paymentStatusChart.destroy();
    if (deliveryTypeChart) deliveryTypeChart.destroy();
    if (trendChart) trendChart.destroy();

    const summary = document.getElementById("summaryCards");
    if (summary) {
        summary.innerHTML = `
            <div class="dashboard-card" style="grid-column: 1 / -1;">
                <div class="dashboard-error">${escapeHtml(message)}</div>
            </div>
        `;
    }

    const table = document.getElementById("recentOrdersTable");
    if (table) {
        table.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">${escapeHtml(message)}</td>
            </tr>
        `;
    }
}

function getDoughnutOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
            legend: {
                position: "bottom",
                labels: {
                    color: getChartTextColor(),
                    boxWidth: 12,
                    usePointStyle: true,
                    pointStyle: "circle",
                    padding: 16,
                    font: {
                        size: 12,
                        weight: "600"
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label(context) {
                        return `${context.label}: ${formatNumber(context.raw)}`;
                    }
                }
            }
        }
    };
}

function getBarOptions(horizontal = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: {
                    color: getChartGridColor()
                },
                ticks: {
                    color: getChartTextColor(),
                    font: { size: 11, weight: "600" }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: getChartGridColor()
                },
                ticks: {
                    color: getChartTextColor(),
                    precision: 0,
                    font: { size: 11, weight: "600" }
                }
            }
        }
    };
}

function getLineOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: getChartTextColor(),
                    font: { size: 11, weight: "600" }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: getChartGridColor()
                },
                ticks: {
                    color: getChartTextColor(),
                    precision: 0,
                    font: { size: 11, weight: "600" }
                }
            }
        }
    };
}

function getChartTextColor() {
    return document.documentElement.dataset.theme === "dark"
        ? "rgba(233,236,255,0.78)"
        : "rgba(17,24,39,0.72)";
}

function getChartGridColor() {
    return document.documentElement.dataset.theme === "dark"
        ? "rgba(255,255,255,0.08)"
        : "rgba(0,0,0,0.08)";
}

function formatCurrency(value) {
    const num = Number(value || 0);
    return `$${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
}

function prettyLabel(value) {
    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.refreshDashboardCharts = function () {
    if (!dashboardDataCache) return;

    renderOrderStatusChart(dashboardDataCache.order_statuses || []);
    renderPaymentStatusChart(dashboardDataCache.payment_statuses || []);
    renderDeliveryTypeChart(dashboardDataCache.delivery_type_usage || []);
    renderTrendChart(dashboardDataCache.last_7_days || []);
};