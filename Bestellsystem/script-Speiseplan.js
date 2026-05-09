import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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

async function ladeGerichte() {
    const { data, error } = await supabase
        .from("Speiseplan")
        .select("*")
        .order("Ausgabedatum", { ascending: true });

    if (error) {
        console.error("Fehler beim Laden des Speiseplans:", error);
        return;
    }

    const container = document.getElementById("speiseplan-container");
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = "<p>Aktuell sind keine Gerichte eingetragen.</p>";
        return;
    }

    for (const gericht of data) {
        const datum = new Date(gericht.Ausgabedatum);
        // +1 wegen UTC-Verschiebung bei reinen Datumswerten
        datum.setMinutes(datum.getMinutes() + datum.getTimezoneOffset());
        const wochentag = WOCHENTAGE[datum.getDay()];
        const datumFormatiert = datum.toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric"
        });

        const eintrag = document.createElement("div");
        eintrag.className = "speiseplan-eintrag";
        eintrag.innerHTML = `
            <div class="speiseplan-links">
                <h3>${wochentag}</h3>
                <p>${datumFormatiert}</p>
            </div>
            <div class="speiseplan-mitte">
                <img src="${gericht.image_url || 'img/Profil.svg'}" class="gericht-bild" alt="${gericht.Gerichtname}">
                <p>Tagesangebot</p>
                <h3>${gericht.Gerichtname}</h3>
                <p class="allergene">Allergene: ${gericht.Allergene || "keine Angabe"}</p>
                <div class="preise">
                    <p>Studierende: <strong>${gericht.PreisStudierende}</strong></p>
                    <p>Bedienstete: <strong>${gericht.PreisBedienstete}</strong></p>
                    <p>Gäste: <strong>${gericht.PreisGast}</strong></p>
                </div>
            </div>
            <div class="speiseplan-rechts">
                <a class="vorbestell-btn" href="Vorbestellungen.html">Vorbestellen</a>
            </div>
        `;

        container.appendChild(eintrag);
    }
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
    const displayName = await ermittleVorname(user);


    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    // Speiseplan aus Supabase laden.
    await ladeGerichte();

});
