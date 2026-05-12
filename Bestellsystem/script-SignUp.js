import { supabase } from "./supabaseClient.js";

// Benutzername aus dem URL-Parameter lesen (wird von SSO-Login übergeben).
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get("username") || "";

// Speichert die E-Mail, die aus der Datenbank geladen wurde.
let verifiedEmail = null;

// Setzt den Nachnamen in der Anrede auf der Seite.
function setGreetingLastName(lastName) {
    const lastNameElement = document.getElementById("signup-lastname");
    if (!lastNameElement) return;
    const safeLastName = (lastName || "").trim();
    if (safeLastName) {
        lastNameElement.textContent = safeLastName;
    }
}

// Zeigt eine Meldung auf der Seite an.
function setMessage(text, isError) {
    const messageElement = document.getElementById("signup-message");
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

// Liest die E-Mail eines Benutzers aus StudentenHochschule.
async function getEmailFromHochschule() {
    const { data, error } = await supabase
        .from("StudentenHochschule")
        .select("E-Mail")
        .ilike("RZ-Kennung", username)
        .maybeSingle();

    if (error) {
        throw new Error("Fehler bei der Datenbankabfrage: " + error.message);
    }

    if (!data || !data["E-Mail"]) {
        throw new Error("Keine E-Mail-Adresse für diesen Benutzer hinterlegt.");
    }

    return data["E-Mail"];
}

// Liest den Nachnamen eines Benutzers aus StudentenHochschule.
async function getLastNameFromHochschule() {
    const { data, error } = await supabase
        .from("StudentenHochschule")
        .select("Nachname")
        .ilike("RZ-Kennung", username)
        .maybeSingle();

    if (error) {
        throw new Error("Fehler bei der Nachnamen-Abfrage: " + error.message);
    }

    return (data?.Nachname || "").trim();
}

// Liest die E-Mail des Benutzers aus StudentenHochschule und sendet den OTP-Code.
async function codeAnfordern() {
    try {
        if (!username) {
            setMessage("Kein Benutzername übergeben. Bitte erneut von der Anmeldeseite starten.", true);
            return;
        }

        setMessage("E-Mail wird gesucht...", false);

        // E-Mail aus der Hochschul-Datenbank laden.
        verifiedEmail = await getEmailFromHochschule();

        // OTP-Code per E-Mail senden (Supabase sendet automatisch einen 6-stelligen Code).
        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: verifiedEmail,
            options: { shouldCreateUser: true }
        });

        if (otpError) {
            setMessage("Fehler beim Senden des Codes: " + otpError.message, true);
            return;
        }

        setMessage("Code wurde an " + verifiedEmail + " gesendet.", false);
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

// Liest den 6-stelligen Code aus den sechs Input-Feldern.
function getOtpFromInputs() {
    const inputs = Array.from(document.querySelectorAll(".pin-input"));
    return inputs.map((input) => input.value.trim()).join("");
}

// Bestaetigt den eingegebenen OTP-Code und registriert den Nutzer in RegistriertePersonen.
async function codeBestaetigen() {
    try {
        if (!username) {
            setMessage("Kein Benutzername übergeben. Bitte erneut von der Anmeldeseite starten.", true);
            return;
        }

        if (!verifiedEmail) {
            verifiedEmail = await getEmailFromHochschule();
        }

        const otp = getOtpFromInputs();
        if (!/^\d{6}$/.test(otp)) {
            setMessage("Bitte den 6-stelligen Code vollständig eingeben.", true);
            return;
        }

        setMessage("Code wird überprüft...", false);

        const { error: verifyError } = await supabase.auth.verifyOtp({
            email: verifiedEmail,
            token: otp,
            type: "email"
        });

        if (verifyError) {
            setMessage("Code ungültig oder abgelaufen: " + verifyError.message, true);
            return;
        }

        // Nach erfolgreicher Verifikation: Vollstaendigen Datensatz aus StudentenHochschule uebernehmen.
        const { data: studentRow, error: studentRowError } = await supabase
            .from("StudentenHochschule")
            .select("*")
            .ilike("RZ-Kennung", username)
            .maybeSingle();

        if (studentRowError) {
            setMessage("Code korrekt, aber Studentendaten konnten nicht geladen werden: " + studentRowError.message, true);
            return;
        }

        if (!studentRow) {
            setMessage("Code korrekt, aber kein Datensatz in StudentenHochschule gefunden.", true);
            return;
        }

        // Nicht alle Felder aus StudentenHochschule sind fuer RegistriertePersonen geeignet.
        // Passwort-Felder werden hier explizit ausgeschlossen.
        const personRow = { ...studentRow };
        delete personRow.Passwort;
        delete personRow.password;

        // Upsert braucht einen UNIQUE-Constraint. Daher hier ohne Constraint:
        // erst pruefen, dann je nach Ergebnis INSERT oder UPDATE.
        const { data: existingPerson, error: existingError } = await supabase
            .from("RegistriertePersonen")
            .select("RZ-Kennung")
            .ilike("RZ-Kennung", username)
            .maybeSingle();

        if (existingError) {
            setMessage("Code korrekt, aber Registrierung fehlgeschlagen: " + existingError.message, true);
            return;
        }

        if (existingPerson) {
            const { error: updateError } = await supabase
                .from("RegistriertePersonen")
                .update(personRow)
                .eq("RZ-Kennung", existingPerson["RZ-Kennung"]);

            if (updateError) {
                setMessage("Code korrekt, aber Update fehlgeschlagen: " + updateError.message, true);
                return;
            }
        } else {
            const { error: insertError } = await supabase
                .from("RegistriertePersonen")
                .insert([personRow]);

            if (insertError) {
                setMessage("Code korrekt, aber Registrierung fehlgeschlagen: " + insertError.message, true);
                return;
            }
        }

        // Passwort aus StudentenHochschule in Supabase Auth setzen,
        // damit der spätere Login mit RZ-Kennung + Passwort funktioniert.
        const hochschulePasswort = studentRow.Passwort || studentRow.password;
        if (hochschulePasswort) {
            const { error: pwError } = await supabase.auth.updateUser({ password: hochschulePasswort });
            if (pwError) {
                setMessage("Registrierung OK, aber Passwort konnte nicht gesetzt werden: " + pwError.message, true);
                return;
            }
        }

        setMessage("Code bestätigt. Registrierung abgeschlossen. Weiterleitung...", false);
        window.location.href = "startseite.html";
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}


document.addEventListener("DOMContentLoaded", function () {
    if (username) {
        getLastNameFromHochschule()
            .then((lastName) => {
                if (lastName) setGreetingLastName(lastName);
            })
            .catch(() => {
                // Bei Fehler bleibt der Platzhaltername bestehen.
            });
    }

    const inputs = Array.from(document.querySelectorAll(".pin-input"));

    inputs.forEach((input, index) => {
        // Nur Ziffern erlauben
        input.addEventListener("keydown", function (e) {
            if (e.key === "Backspace") {
                input.value = "";
                if (index > 0) inputs[index - 1].focus();
                e.preventDefault();
            } else if (!/^[0-9]$/.test(e.key) && !["Tab", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
            }
        });

        input.addEventListener("input", function () {
            if (input.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        // Einfügen (Paste) eines 6-stelligen Codes
        input.addEventListener("paste", function (e) {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
            pasted.split("").slice(0, inputs.length).forEach((char, i) => {
                if (inputs[i]) inputs[i].value = char;
            });
            const lastFilled = Math.min(pasted.length, inputs.length - 1);
            inputs[lastFilled].focus();
        });
    });

    // Button: Code anfordern
    const btnAnfordern = document.getElementById("btn-code-anfordern");
    if (btnAnfordern) {
        btnAnfordern.addEventListener("click", codeAnfordern);
    }

    // Button: Neuen Code anfordern (identische Funktion)
    const btnNeu = document.getElementById("btn-code-neu");
    if (btnNeu) {
        btnNeu.addEventListener("click", codeAnfordern);
    }

    // Button: Code bestätigen
    const btnBestaetigen = document.getElementById("btn-code-bestaetigen");
    if (btnBestaetigen) {
        btnBestaetigen.addEventListener("click", codeBestaetigen);
    }
});
