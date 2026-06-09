import { supabase } from "./supabaseClient.js";

const ADMIN_LOCAL_SESSION_KEY = "admin-local-session-v1";
const ADMIN_LOCAL_SESSION_MS = 12 * 60 * 60 * 1000;
const AUTH_LOGIN_TIMEOUT_MS = 7000;

function withTimeout(promise, timeoutMs, fallbackValue) {
    return Promise.race([
        promise,
        new Promise(function (resolve) {
            window.setTimeout(function () {
                resolve(fallbackValue);
            }, timeoutMs);
        })
    ]);
}

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
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function istUngueltigeLoginKombination(errorMessage) {
    const msg = (errorMessage || "").toLowerCase();
    return msg.includes("invalid login credentials") || msg.includes("invalid credentials");
}

async function istAdminNutzer(username, email) {
    const rzKennung = String(username || "").trim();
    const loginEmail = String(email || "").trim();

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

async function ladeAdminEmailByRzKennung(username) {
    const rzKennung = String(username || "").trim();
    if (!rzKennung) {
        return null;
    }

    const { data, error } = await supabase
        .from("AdminNutzer")
        .select("E-Mail")
        .eq("RZ-Kennung", rzKennung)
        .maybeSingle();

    if (error) {
        console.warn("Admin-E-Mail konnte nicht geladen werden:", error.message || error);
        return null;
    }

    const adminEmail = String(data?.["E-Mail"] || "").trim().toLowerCase();
    return adminEmail || null;
}

function speichereAdminLokaleSession(adminRow, username) {
    const payload = {
        adminId: adminRow?.id || null,
        rzKennung: String(adminRow?.["RZ-Kennung"] || username || "").trim(),
        email: String(adminRow?.["E-Mail"] || "").trim().toLowerCase(),
        expiresAt: Date.now() + ADMIN_LOCAL_SESSION_MS
    };

    sessionStorage.setItem(ADMIN_LOCAL_SESSION_KEY, JSON.stringify(payload));
}

async function loginAlsAdminDirekt(username, email, password) {
    const rzKennung = String(username || "").trim();
    const loginEmail = String(email || "").trim();

    if (rzKennung) {
        const { data: byRz, error: rzError } = await supabase
            .from("AdminNutzer")
            .select("id, RZ-Kennung, E-Mail")
            .eq("RZ-Kennung", rzKennung)
            .eq("Passwort", password)
            .maybeSingle();

        if (!rzError && byRz) {
            return byRz;
        }
    }

    if (loginEmail) {
        const { data: byEmail, error: mailError } = await supabase
            .from("AdminNutzer")
            .select("id, RZ-Kennung, E-Mail")
            .ilike("E-Mail", loginEmail)
            .eq("Passwort", password)
            .maybeSingle();

        if (!mailError && byEmail) {
            return byEmail;
        }
    }

    return null;
}


// Fuehrt den eigentlichen Login-Prozess aus.
async function login() {
    try {
        // Eingabefelder fuer Benutzername und Passwort aus dem DOM lesen.
        const usernameElement = document.getElementById("login-username");
        const passwordElement = document.getElementById("login-password");

        // Falls Felder nicht gefunden werden, sichtbare Rueckmeldung geben.
        if (!usernameElement || !passwordElement) {
            setMessage("Login-Formular konnte nicht geladen werden.", true);
            return;
        }

        // Benutzerwerte einlesen (Leerzeichen am Rand entfernen).
        const username = usernameElement.value.trim().toLowerCase();
        const password = passwordElement.value;

        // Schritt 1: Pflichtfeld-Pruefung – beide Felder muessen ausgefuellt sein.
        if (!username || !password) {
            setMessage("Bitte Benutzername und Passwort eingeben.", true);
            return;
        }

        // Schritt 2: Erst Auth-Login pruefen.
        const defaultEmailForLogin = username + "@hs-esslingen.de";
        const emailForLogin = defaultEmailForLogin;
        setMessage("Anmeldedaten werden geprueft...", false);

        // Admin-Login ohne Supabase-Auth-Konto direkt ueber AdminNutzer zulassen.
        const adminDirektVorAuth = await withTimeout(loginAlsAdminDirekt(username, emailForLogin, password), 1500, null);
        if (adminDirektVorAuth) {
            speichereAdminLokaleSession(adminDirektVorAuth, username);
            setMessage("Admin-Login erfolgreich. Weiterleitung...", false);
            window.location.href = "ADMIN-SEITE/ADMIN-Seite.html";
            return;
        }

        const authResult = await withTimeout(
            supabase.auth.signInWithPassword({
                email: emailForLogin,
                password
            }),
            AUTH_LOGIN_TIMEOUT_MS,
            { timedOut: true, error: { message: "TIMEOUT" } }
        );

        if (authResult?.timedOut) {
            setMessage("Login dauert zu lange. Bitte Verbindung prüfen und erneut versuchen.", true);
            return;
        }

        const loginError = authResult?.error;

        if (loginError) {
            if (istUngueltigeLoginKombination(loginError.message)) {
                // Bei ungueltigen Credentials zwischen
                // "falsches Passwort" und "nicht registriert" unterscheiden.
                const { data: person, error: personError } = await supabase
                    .from("students")
                    .select("email")
                    .ilike("email", defaultEmailForLogin)
                    .maybeSingle();

                if (personError) {
                    setMessage("Fehler bei der Datenbankabfrage: " + personError.message, true);
                    return;
                }

                if (person) {
                    setMessage("Falsches Passwort. Bitte erneut eingeben.", true);
                    return;
                }

                window.location.href = "SignUp.html?username=" + encodeURIComponent(username);
                return;
            }
            setMessage("Login fehlgeschlagen: " + loginError.message, true);
            return;
        }

        const isAdmin = await withTimeout(istAdminNutzer(username, emailForLogin), 1500, false);
        if (isAdmin) {
            const adminDirekt = await withTimeout(loginAlsAdminDirekt(username, emailForLogin, password), 1500, null);
            if (adminDirekt) {
                speichereAdminLokaleSession(adminDirekt, username);
                window.location.href = "ADMIN-SEITE/ADMIN-Seite.html";
                return;
            }
        }

        // Fallback: erfolgreicher Auth-Login muss immer weiterleiten.
        window.location.href = "startseite.html";
        return;
    } catch (error) {
        const msg = String(error?.message || error || "").toLowerCase();
        if (msg.includes("load failed") || msg.includes("network") || msg.includes("fetch")) {
            setMessage("Netzwerkfehler beim Login. Bitte Internetverbindung prüfen und erneut versuchen.", true);
            return;
        }

        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

// Verbindet Eingaben mit der Login-Funktion.
function initLoginSeite() {
    // Login-Button und Passwortfeld holen.
    const loginButton = document.getElementById("login-button");
    const registrierButton = document.getElementById("registrier-button");
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");

    // Klick auf den Login-Button startet den Login.
    if (loginButton) {
        loginButton.addEventListener("click", function () {
            login();
        });
    }

    // Klick auf den Registrieren-Button fuehrt zur SignUp-Seite.
    if (registrierButton) {
        registrierButton.addEventListener("click", function () {
            const enteredUsername = usernameInput?.value?.trim() || "";
            if (enteredUsername) {
                window.location.href = "SignUp.html?username=" + encodeURIComponent(enteredUsername);
                return;
            }
            window.location.href = "SignUp.html";
        });
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

    // Passwort anzeigen/verbergen per Auge-Button.
    const showPasswordButton = document.getElementById("show-password");
    if (showPasswordButton && passwordInput) {
        showPasswordButton.addEventListener("click", function () {
            const isHidden = passwordInput.type === "password";
            passwordInput.type = isHidden ? "text" : "password";
            const eyeImg = showPasswordButton.querySelector("img");
            if (eyeImg) {
                eyeImg.src = isHidden ? "img/eye-off-icon.svg" : "img/eye-icon.svg";
                eyeImg.alt = isHidden ? "Passwort verbergen" : "Passwort anzeigen";
            }
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginSeite);
} else {
    initLoginSeite();
}
