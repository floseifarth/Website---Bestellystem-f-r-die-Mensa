import { supabase } from "./supabaseClient.js";

const AUTH_LOGIN_TIMEOUT_MS = 2500;

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

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function baueLoginEmailAusEingabe(rawInput) {
    const cleaned = normalizeText(rawInput);
    if (!cleaned) {
        return "";
    }
    if (cleaned.includes("@")) {
        return cleaned;
    }
    return cleaned + "@hs-esslingen.de";
}

async function istAdminNutzer(username, email) {
    const rzKennung = normalizeText(username);
    const loginEmail = normalizeText(email);

    try {
        const byMailPromise = loginEmail
            ? supabase
                .from("AdminNutzer")
                .select("id")
                .ilike("E-Mail", loginEmail)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null });

        const byRzPromise = rzKennung
            ? supabase
                .from("AdminNutzer")
                .select("id")
                .ilike("RZ-Kennung", rzKennung)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null });

        const [byMailRes, byRzRes] = await Promise.all([byMailPromise, byRzPromise]);

        if (byMailRes?.error) {
            console.warn("Admin-Erkennung per E-Mail fehlgeschlagen:", byMailRes.error.message || byMailRes.error);
        }
        if (byRzRes?.error) {
            console.warn("Admin-Erkennung per RZ-Kennung fehlgeschlagen:", byRzRes.error.message || byRzRes.error);
        }

        return Boolean(byMailRes?.data || byRzRes?.data);
    } catch (error) {
        console.warn("Admin-Erkennung fehlgeschlagen:", error?.message || error);
    }

    return false;
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
        const usernameInput = usernameElement.value;
        const username = normalizeText(usernameInput);
        const password = passwordElement.value;

        // Schritt 1: Pflichtfeld-Pruefung – beide Felder muessen ausgefuellt sein.
        if (!username || !password) {
            setMessage("Bitte Benutzername und Passwort eingeben.", true);
            return;
        }

        // Zu kurze Passwoerter direkt abfangen, statt als "nicht registriert" zu behandeln.
        if (password.length < 6) {
            setMessage("Passwort muss mindestens 6 Zeichen haben.", true);
            return;
        }

        if (navigator.onLine === false) {
            setMessage("Keine Internetverbindung. Bitte Verbindung prüfen und erneut versuchen.", true);
            return;
        }

        // Schritt 2: Erst Auth-Login pruefen.
        const emailForLogin = baueLoginEmailAusEingabe(usernameInput);
        setMessage("Anmeldedaten werden geprüft...", false);

        async function loginVersuch(timeoutMs) {
            return withTimeout(
                supabase.auth.signInWithPassword({
                    email: emailForLogin,
                    password
                }),
                timeoutMs,
                { timedOut: true, error: { message: "TIMEOUT" } }
            );
        }

        const authResult = await loginVersuch(AUTH_LOGIN_TIMEOUT_MS);

        if (authResult?.timedOut) {
            setMessage("Login dauert zu lange. Bitte Verbindung prüfen und erneut versuchen.", true);
            return;
        }

        const loginError = authResult?.error;

        if (loginError) {
            if (istUngueltigeLoginKombination(loginError.message)) {
                setMessage("Benutzername oder Passwort ist falsch.", true);
                return;
            }
            const loginErrorMsg = String(loginError.message || "").toLowerCase();
            if (loginErrorMsg.includes("load failed") || loginErrorMsg.includes("network") || loginErrorMsg.includes("fetch")) {
                setMessage("Verbindung zum Login-Service fehlgeschlagen. Bitte kurz erneut versuchen.", true);
                return;
            }
            setMessage("Login fehlgeschlagen: " + loginError.message, true);
            return;
        }

        const sessionUserEmail = String(authResult?.data?.session?.user?.email || "").trim();
        const authUserEmail = String(authResult?.data?.user?.email || sessionUserEmail || emailForLogin).trim();

        const rzKennungFuerAdminCheck = authUserEmail.includes("@") ? authUserEmail.split("@")[0] : username;
        const isAdminNachAuth = await istAdminNutzer(rzKennungFuerAdminCheck, authUserEmail);
        if (isAdminNachAuth) {
            window.location.href = "ADMIN-SEITE/ADMIN-Seite.html";
            return;
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
    const forgotPasswordLink = document.getElementById("login-forgot-password");
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

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener("click", function (event) {
            const enteredUsername = usernameInput?.value?.trim() || "";
            if (!enteredUsername) {
                return;
            }

            event.preventDefault();
            window.location.href = "Passwort-zuruecksetzen.html?username=" + encodeURIComponent(enteredUsername);
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
