import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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
        .from("RegistriertePersonen")
        .select("Vorname")
        .ilike("E-Mail", email)
        .maybeSingle();

    if (!error && data?.Vorname) {
        return data.Vorname;
    }

    return email;
}


document.addEventListener("DOMContentLoaded", async function () {
    // Header-Datum initialisieren
    const heute = new Date();
    const wochentagHeute = WOCHENTAGE[heute.getDay()];
    const datumHeute = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentagHeute + ", " + datumHeute;
    }

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

    // Preis von Zahl in deutsches Format umwandeln (z.B. 4.10 → "4,10 €")
    function formatPrice(amount) {
        return amount.toFixed(2).replace(".", ",") + " €";
    }

    // Preis aus Text in Zahl umwandeln (z.B. "4,10 €" → 4.1)
    function parsePrice(priceText) {
        const cleaned = priceText.replace(/[^\d,.-]/g, "");
        return Number(cleaned.replace(",", "."));
    }

    // Numerisches Datum umwandeln (z.B. "16.05.2026" → "16. Mai 2026")
    function formatDatum(datumStr) {
        const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const match = datumStr.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
        if (!match) return datumStr;
        return `${match[1].padStart(2, '0')}. ${monate[parseInt(match[2], 10) - 1]} ${match[3]}`;
    }

    //Pop-Up Fenster zur Bestätigung der Stornierung
    function bestaetigungMitEigenemModal(frage) {
        return new Promise(function (resolve) {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";

            const dialog = document.createElement("div");
            dialog.className = "modal-dialog";
            dialog.innerHTML = `
                <p class="modal-text">${frage}</p>
                <div class="modal-actions">
                    <button type="button" class="modal-nein">Abbrechen</button>
                    <button type="button" class="modal-ja">Ja, stornieren</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            dialog.querySelector(".modal-nein").addEventListener("click", function () {
                overlay.remove();
                resolve(false);
            });

            dialog.querySelector(".modal-ja").addEventListener("click", function () {
                overlay.remove();
                resolve(true);
            });
        });
    }

    // Bestellliste im HTML und gespeicherte Bestellungen aus localStorage holen
    const orderList = document.getElementById("order-list");
    const bestellungen = JSON.parse(localStorage.getItem("bestellungen")) || [];

    if (!orderList) return;

    // Liste leeren bevor neu befüllt wird
    orderList.innerHTML = "";

    if (bestellungen.length === 0) {
        // Platzhalter anzeigen wenn keine Bestellungen vorhanden
        const emptyRow = document.createElement("div");
        emptyRow.className = "bestell-zeile";
        emptyRow.innerText = "Noch keine Vorbestellung.";
        orderList.appendChild(emptyRow);
    } else {
        let total = 0;

        // Bestellungen nach Datum + Gericht gruppieren
        const gruppen = {};
        bestellungen.forEach(function (item, index) {
            const key = `${item.date}||${item.name}`;
            if (!gruppen[key]) {
                gruppen[key] = { ...item, kategorien: [], indices: [] };
            }
            gruppen[key].kategorien.push({ label: item.category || 'Studierende', price: item.price });
            gruppen[key].indices.push(index);
        });

        Object.values(gruppen).forEach(function (gruppe) {
            const dateParts = (gruppe.date || '').split(', ');
            const wochentag = dateParts[0] || '';
            const datumText = formatDatum(dateParts[1] || '');

            // Kategorien zählen und Preise summieren
            const counts = {};
            let gruppenTotal = 0;
            gruppe.kategorien.forEach(function (k) {
                counts[k.label] = (counts[k.label] || 0) + 1;
                gruppenTotal += parsePrice(k.price);
            });
            const kategorieText = Object.entries(counts).map(([label, n]) => `${n}x ${label}`).join(', ');

            const row = document.createElement("div");
            row.className = "speiseplan-eintrag";
            row.innerHTML = `
                <div class="speiseplan-links">
                    <h3>${wochentag}</h3>
                    <p>${datumText}</p>
                </div>
                <div class="speiseplan-mitte">
                    <img src="${gruppe.image || ''}" class="gericht-bild" alt="">
                    <p>Tagesangebot</p>
                    <h3>${gruppe.name || ''}</h3>
                    <div class="preise">
                        <p>${kategorieText}</p>
                        <p>Gesamt: <strong>${formatPrice(gruppenTotal)}</strong></p>
                    </div>
                </div>
                <div class="speiseplan-rechts">
                    <button type="button" class="vorbestell-btn remove-button">Stornieren</button>
    
                    <button type="button" class="vorbestell-btn edit-button">Bearbeiten</button>
                </div>`;

            row.querySelector(".remove-button").addEventListener("click", async function () {
                const bestaetigt = await bestaetigungMitEigenemModal("Möchtest du diese Bestellung wirklich stornieren?");
                if (!bestaetigt) {
                    return;
                }

                // Alle Einträge dieser Gruppe entfernen (von hinten, damit Indizes stimmen)
                gruppe.indices.slice().sort((a, b) => b - a).forEach(function (i) {
                    bestellungen.splice(i, 1);
                });
                localStorage.setItem("bestellungen", JSON.stringify(bestellungen));
                location.reload();
            });

            row.querySelector(".edit-button").addEventListener("click", function () {
                // Hier kann die Logik zum Bearbeiten der Bestellung eingefügt werden
            });

            orderList.appendChild(row);
            total += gruppenTotal;
        });



    }
});
