import { supabase } from "./supabaseClient.js";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const QR_BOX_ID = "qr-code-box";
const QR_HINT_ID = "qr-code-hinweis";

async function ladeUserIdFuerQr(user) {
    // Die user_id wird aus students geladen; falls kein Treffer vorhanden ist,
    // verwenden wir die Auth-ID als sicheren Fallback.
    const { data, error } = await supabase
        .from("students")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        throw new Error("user_id konnte nicht aus students geladen werden: " + error.message);
    }

    return data?.user_id || user.id;
}

function baueQrPayload(userId) {
    // Der Scanner kann spaeter die user_id auslesen und serverseitig zuordnen.
    return `mensa://pickup?user_id=${encodeURIComponent(userId)}`;
}

function setQrHintText(text) {
    const hintElement = document.getElementById(QR_HINT_ID);
    if (hintElement) {
        hintElement.textContent = text;
    }
}

async function rendereQrCode(userId) {
    const qrBox = document.getElementById(QR_BOX_ID);
    if (!qrBox) {
        return;
    }

    // Aus dem Payload wird eine Data-URL erzeugt und direkt als Bild angezeigt.
    const qrPayload = baueQrPayload(userId);
    const dataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280
    });

    qrBox.innerHTML = `<img src="${dataUrl}" alt="Persoenlicher QR-Code" width="280" height="280">`;
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
    const displayName = await ermittleVorname(user);                       // Fallback: E-Mail-Adresse

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    try {
        // QR basiert auf der eindeutig zugeordneten user_id des eingeloggten Nutzers.
        const userIdFuerQr = await ladeUserIdFuerQr(user);
        await rendereQrCode(userIdFuerQr);
        setQrHintText("Dieser QR-Code ist eindeutig mit Ihrem Nutzerkonto verknüpft.");
    } catch (error) {
        console.error(error);
        const qrBox = document.getElementById(QR_BOX_ID);
        if (qrBox) {
            qrBox.innerHTML = "<p>QR-Code konnte nicht geladen werden.</p>";
        }
        setQrHintText("Bitte prüfen Sie, ob in students eine gültige user_id hinterlegt ist.");
    }

});
