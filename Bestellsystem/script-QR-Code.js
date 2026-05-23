import { supabase } from "./supabaseClient.js";

async function ermittleVorname(user) {
    const fullName = (user.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = (user.email || "").trim();
    if (email) {
        const { data, error } = await supabase
            .from("RegistriertePersonen")
            .select("Vorname")
            .ilike("E-Mail", email)
            .maybeSingle();

        if (error) {
            console.warn("Vorname konnte nicht aus RegistriertePersonen geladen werden:", error.message);
        } else {
            const vornameDb = (data?.Vorname || "").trim();
            if (vornameDb) {
                return vornameDb;
            }
        }
    }

    return "Gast";
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

    // Vorname aus Auth-Metadaten oder aus RegistriertePersonen ermitteln.
    const displayName = await ermittleVorname(user);                       // Fallback: E-Mail-Adresse

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    const qrBox = document.getElementById("qr-code-box");
    if (qrBox) {
        qrBox.innerHTML = "<p>QR-Code folgt später aus dem Datenbank-Token.</p>";
    }

});
