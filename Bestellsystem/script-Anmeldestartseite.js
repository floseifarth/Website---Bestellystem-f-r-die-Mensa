import { supabase } from "./supabaseClient.js";

// Zeigt eine Rueckmeldung unter dem Login-Formular an.
// `isError` steuert die Farbe der Nachricht (rot bei Fehler, gruen bei Erfolg/Info).
function setMessage(text, isError) {
    // Das Ausgabeelement fuer Login-Nachrichten holen.
    const messageElement = document.getElementById("login-message");
    // Falls das Element nicht existiert, Funktion sicher beenden.
    if (!messageElement) return;

    // Textinhalt der Nachricht setzen.
    messageElement.textContent = text;
    // Farblich zwischen Fehler und Erfolg unterscheiden.
    // messageElement.style.color = isError ? "#b42318" : "#027a48";
}

async function istAdminNutzer(email) {
    const loginEmail = String(email || "").trim();
    const rzKennung = loginEmail.split("@")[0] || "";

    try {
        if (rzKennung) {
            const { data: byRz, error: rzError } = await supabase
                .from("AdminNutzer")
                .select("id")
                .eq("RZ-Kennung", rzKennung)
                .maybeSingle();

            if (!rzError && byRz) {
                return true;
            }
        }

        if (loginEmail) {
            const { data: byEmail, error: mailError } = await supabase
                .from("AdminNutzer")
                .select("id")
                .ilike("E-Mail", loginEmail)
                .maybeSingle();

            if (!mailError && byEmail) {
                return true;
            }
        }
    } catch (error) {
        console.warn("Admin-Erkennung fehlgeschlagen:", error?.message || error);
    }

    return false;
}


let istRegistrierung = false; // Lokaler Zustand, um zwischen Anmelde- und Registrierungsmodus zu wechseln.
// Wechselt zwischen Anmelde- und Registrierungsmodus.
function toggleRegistrierung() {
    istRegistrierung = !istRegistrierung;
    const anzeige = istRegistrierung ? "block" : "none";
    document.getElementById("login-name").style.display = anzeige;
    document.getElementById("login-password-confirm").style.display = anzeige;

    document.getElementById("login-button").textContent = istRegistrierung ? "Registrieren" : "Anmelden";
    document.getElementById("register-toggle").textContent = istRegistrierung ? "Zurück zum Login" : "Neu registrieren";
}


// Registrierungsprozess
async function register() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const passwordConfirm = document.getElementById("login-password-confirm").value;
    const name = document.getElementById("login-name").value.trim();

    // Pflichtfelder prüfen
    if (!name || !email || !password || !passwordConfirm) {
        setMessage("Bitte alle Felder ausfüllen.", true);
        return;
    }

    // Passwörter vergleichen
    if (password !== passwordConfirm) {
        setMessage("Passwörter stimmen nicht überein.", true);
        return;
    }

    setMessage("Registrierung wird durchgeführt...", false);

    // User wird in Superbase Auth angelegt
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { //Zusätzliche Nutzer-Infos
            data: {
                full_name: name
            }
        }
    });

    if (error) {
        setMessage("Registrierung fehlgeschlagen: " + error.message, true);
        return;
    }

    setMessage("Registrierung erfolgreich! Bitte E-Mail bestätigen.", false);
}

// Fuehrt den eigentlichen Login-Prozess aus.
async function login() {
    // Eingabefelder fuer E-Mail und Passwort aus dem DOM lesen.
    const emailElement = document.getElementById("login-email");
    const passwordElement = document.getElementById("login-password");

    // Falls Felder nicht gefunden werden, Abbruch ohne Fehler.
    if (!emailElement || !passwordElement) {
        return;
    }

    // Benutzerwerte einlesen (E-Mail mit trim, um Leerzeichen am Rand zu entfernen).
    const email = emailElement.value.trim();
    const password = passwordElement.value;

    // Einfache Pflichtfeld-Prüfung vor dem API-Aufruf.
    if (!email || !password) {
        setMessage("Bitte E-Mail und Passwort eingeben.", true);
        return;
    }

    // Info an den Nutzer: Login wird gerade geprüft.
    setMessage("Anmeldung wird geprüft...", false);

    // Login-Anfrage an Supabase Auth schicken.
    // Bei Erfolg kommt eine Session zurueck, bei Fehler ist `error` gesetzt.
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    // Fehlerfall: Fehlermeldung anzeigen und Funktion beenden.
    if (error) {
        setMessage("Login fehlgeschlagen: " + error.message, true);
        return;
    }

    // Erfolgsfall: Erfolgsmeldung anzeigen und auf Startseite weiterleiten.
    setMessage("Login erfolgreich. Weiterleitung...", false);
    const isAdmin = await istAdminNutzer(email);
    window.location.href = isAdmin ? "ADMIN-SEITE/ADMIN-Seite.html" : "startseite.html";
}

// Wartet, bis das HTML vollstaendig geladen ist,
// und verbindet dann die Eingaben mit der Login-Funktion.
document.addEventListener("DOMContentLoaded", function () {
    // Login-Button und Passwortfeld holen.
    const loginButton = document.getElementById("login-button");
    const passwordInput = document.getElementById("login-password");

    // Klick auf den Login-Button startet Login oder Registrierung je nach Modus.
    if (loginButton) {
        loginButton.addEventListener("click", function () {
            if (istRegistrierung) {
                register();
            } else {
                login();
            }
        });
    }

    // Klick auf "Neu registrieren" schaltet den Registrierungsmodus um.
    const registerToggle = document.getElementById("register-toggle");
    if (registerToggle) {
        registerToggle.addEventListener("click", toggleRegistrierung);
    }

    // Enter im Passwortfeld startet ebenfalls den Login.
    if (passwordInput) {
        passwordInput.addEventListener("keydown", function (event) {
            // Nur bei Enter ausloesen.
            if (event.key === "Enter") {
                login();
            }
        });
    }
});
