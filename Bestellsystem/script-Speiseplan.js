import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function normalisiereBestellDatum(bestellDatum) {
    const dateParts = String(bestellDatum || "").split(", ");
    const datumText = dateParts[1] || dateParts[0] || "";

    const numerischMatch = datumText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (numerischMatch) {
        const tag = numerischMatch[1].padStart(2, "0");
        const monat = numerischMatch[2].padStart(2, "0");
        const jahrRoh = numerischMatch[3];
        const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
        return `${tag}.${monat}.${jahr}`;
    }

    const monate = {
        Januar: "01",
        Februar: "02",
        März: "03",
        April: "04",
        Mai: "05",
        Juni: "06",
        Juli: "07",
        August: "08",
        September: "09",
        Oktober: "10",
        November: "11",
        Dezember: "12"
    };

    const textMatch = datumText.match(/^(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{2}|\d{4})$/);
    if (!textMatch) {
        return datumText;
    }

    const tag = textMatch[1].padStart(2, "0");
    const monat = monate[textMatch[2]];
    const jahrRoh = textMatch[3];
    const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
    if (!monat) {
        return datumText;
    }

    return `${tag}.${monat}.${jahr}`;
}

function formatiereZeitraumDatum(date) {
    return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function ladeGerichtzeitraum(startDate, endDate) {
    const anzeigeElement = document.getElementById("GerichtanzeigeDatum");
    if (!anzeigeElement) {
        return;
    }

    const startString = formatiereZeitraumDatum(startDate);
    const endString = formatiereZeitraumDatum(endDate);
    anzeigeElement.innerText = `Gerichte für den Zeitraum: ${startString} - ${endString}`;
}

function ermittleVorbestellungsZaehler() {
    const bestellungen = JSON.parse(localStorage.getItem("bestellungen")) || [];
    const zaehler = {};

    bestellungen.forEach(function (bestellung) {
        const datum = normalisiereBestellDatum(bestellung.date);
        const gericht = String(bestellung.name || "").trim();
        const key = `${datum}||${gericht}`;
        zaehler[key] = (zaehler[key] || 0) + 1;
    });

    return zaehler;
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

    return email;
}

async function ladeGerichte() {
    const vorbestellungsZaehler = ermittleVorbestellungsZaehler();
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    //Zeigt die aktuellen Gerichte für die nächsten 3 Wochen an (inklusive heute).
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 17);
    ladeGerichtzeitraum(startDate, endDate);

    const startIsoDate = toIsoDate(startDate);
    const endIsoDate = toIsoDate(endDate);

    const { data, error } = await supabase
        .from("Speiseplan")
        .select("*")
        .gte("Ausgabedatum", startIsoDate)
        .lte("Ausgabedatum", endIsoDate)
        .order("Ausgabedatum", { ascending: true });

    if (error) {
        console.error("Fehler beim Laden des Speiseplans:", error);
        return;
    }

    const container = document.getElementById("speiseplan-container");
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = "<p>Für die nächsten 7 Tage sind aktuell keine Gerichte eingetragen.</p>";
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
        const vorbestellKey = `${datumFormatiert}||${String(gericht.Gerichtname || "").trim()}`;
        const anzahlVorbestellungen = vorbestellungsZaehler[vorbestellKey] || 0;

        const eintrag = document.createElement("div");
        eintrag.className = anzahlVorbestellungen > 0
            ? "speiseplan-eintrag ist-vorbestellt"
            : "speiseplan-eintrag";
        eintrag.innerHTML = `
            ${anzahlVorbestellungen > 0 ? '<span class="vorbestellt-notiz">Vorbestellt!</span>' : ''}
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
                    <p>Bedienstete: <strong>${gericht.PreisBedienstet}</strong></p>
                    <p>Gäste: <strong>${gericht.PreisGast}</strong></p>
                </div>
            </div>
            <div class="speiseplan-rechts"></div>
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

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    const displayName = await ermittleVorname(user);


    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    // Speiseplan aus Supabase laden.
    await ladeGerichte();
});
