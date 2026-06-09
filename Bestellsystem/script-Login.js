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
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function istUngueltigeLoginKombination(errorMessage) {
    const msg = (errorMessage || "").toLowerCase();
    return msg.includes("invalid login credentials") || msg.includes("invalid credentials");
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
        const emailForLogin = username + "@hs-esslingen.de";
        setMessage("Anmeldedaten werden geprueft...", false);

        const { error: loginError } = await supabase.auth.signInWithPassword({
            email: emailForLogin,
            password
        });

        if (loginError) {
            if (istUngueltigeLoginKombination(loginError.message)) {
                // Bei ungueltigen Credentials zwischen
                // "falsches Passwort" und "nicht registriert" unterscheiden.
                const { data: person, error: personError } = await supabase
                    .from("students")
                    .select("email")
                    .ilike("email", emailForLogin)
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

        window.location.href = "startseite.html";
        return;
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

// Wartet, bis das HTML vollstaendig geladen ist,
// und verbindet dann die Eingaben mit der Login-Funktion.
document.addEventListener("DOMContentLoaded", function () {
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
});
