import { supabase } from "./supabaseClient.js";

function todayIso() {
    return new Date().toISOString().split("T")[0];
}

async function updateHeaderStatusBadge() {
    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
        badge.style.display = "none";
        return;
    }

    const isoToday = todayIso();
    const { data } = await supabase
        .from("Bestellungen")
        .select("id, status")
        .eq("auth_user_id", user.id)
        .eq("bestell_datum", isoToday);

    const rows = Array.isArray(data) ? data : [];
    const hasActiveOrder = rows.some(function (r) {
        return r.status === "bestellt" || r.status === "abgeholt" || !r.status;
    });

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const pickupStart = 12 * 60;
    const pickupEnd = 13 * 60 + 15;
    const inPickupWindow = minutes >= pickupStart && minutes < pickupEnd;

    badge.style.display = "inline-block";
    badge.className = "bestellstatus-badge";

    if (inPickupWindow && hasActiveOrder) {
        badge.classList.add("badge-essensvergabe");
        badge.textContent = "Essensvergabe";
    } else if (hasActiveOrder) {
        badge.classList.add("badge-vorbestellt");
        badge.textContent = "Vorbestellt";
    } else {
        badge.classList.add("badge-keine");
        badge.textContent = "Keine aktive Bestellung";
    }
}

updateHeaderStatusBadge().catch(function () {
    // Keep pages functional even when status lookup fails.
});
