import { supabase } from "./supabaseClient.js";
async function aktualisiereBestellstatusHeader(userId) {
    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    const heute = new Date();
    const isoHeute = heute.getFullYear() + "-" +
        String(heute.getMonth() + 1).padStart(2, "0") + "-" +
        String(heute.getDate()).padStart(2, "0");

    const { data } = await supabase
        .from("Bestellungen")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("bestell_datum", isoHeute)
        .limit(1);

    const hatBestellung = Array.isArray(data) && data.length > 0;
    const stunde = heute.getHours();
    const minute = heute.getMinutes();
    const zeitInMinuten = stunde * 60 + minute;
    const ist1200 = 12 * 60;
    const ist1330 = 13 * 60 + 30;

    badge.style.display = "inline-block";
    badge.className = "bestellstatus-badge";

    if (zeitInMinuten >= ist1200 && zeitInMinuten < ist1330) {
        badge.classList.add("badge-essensvergabe");
        badge.textContent = "Essensvergabe";
    } else if (hatBestellung) {
        badge.classList.add("badge-vorbestellt");
        badge.textContent = "Vorbestellt";
    } else {
        badge.classList.add("badge-keine");
        badge.textContent = "Keine aktive Bestellung";
    }
}
async function ermittleVorname(user) {
    const fullName = (user.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = (user.email || "").trim();
    if (!email) {
        return "Gast";
    }

    const { data, error } = await supabase
        .from("students")
        .select("Vorname")
        .ilike("email", email)
        .maybeSingle();

    if (!error && data?.Vorname) {
        return data.Vorname;
    }

    return email.split("@")[0];
}

// Seite ist bereit – Session und Name laden.
document.addEventListener("DOMContentLoaded", async function () {

    // Aktuelle Supabase-Session abrufen (gespeichert nach dem Login).
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "Anmeldestartseite.html";
        return;
    }

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    const displayName = await ermittleVorname(user);

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;

    }
    aktualisiereBestellstatusHeader(user.id);
});
