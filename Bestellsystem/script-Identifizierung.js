import { supabase } from "./supabaseClient.js";

const urlParams = new URLSearchParams(window.location.search);
const usernameFromUrl = (urlParams.get("username") || "").trim().toLowerCase();

let verifiedEmail = null;

function showCodeModal(email) {
    const overlay = document.getElementById("code-modal");
    const textElement = document.getElementById("code-modal-text");

    if (textElement) {
        textElement.textContent = "Der Einmalcode wurde an " + email + " gesendet.";
    }

    if (overlay) {
        overlay.classList.add("is-visible");
        overlay.setAttribute("aria-hidden", "false");
    }
}

function hideCodeModal() {
    const overlay = document.getElementById("code-modal");
    if (overlay) {
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
    }
}

function setMessage(text, isError) {
    const messageElement = document.getElementById("identifizierung-message");
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function readPendingRegistration() {
    try {
        const raw = sessionStorage.getItem("pending-registration");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getUsername() {
    const pending = readPendingRegistration();
    const pendingUsername = (pending?.username || "").trim().toLowerCase();
    return usernameFromUrl || pendingUsername;
}

function buildHsEmail(username) {
    return username + "@hs-esslingen.de";
}

function setIdentityPreview(username) {
    const emailElement = document.getElementById("identifizierung-email");

    if (emailElement) {
        emailElement.textContent = username ? buildHsEmail(username) : "-";
    }
}

async function codeAnfordern() {
    try {
        const username = getUsername();
        if (!username) {
            setMessage("Keine RZ-Kennung gefunden. Bitte zuerst über die Registrierung starten.", true);
            return;
        }

        verifiedEmail = buildHsEmail(username);
        setMessage("Bitte warten ...", false);

        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: verifiedEmail,
            options: { shouldCreateUser: true }
        });

        if (otpError) {
            setMessage("Fehler beim Senden des Codes: " + otpError.message, true);
            return;
        }

        showCodeModal(verifiedEmail);
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

function getOtpFromInputs() {
    const inputs = Array.from(document.querySelectorAll(".pin-input"));
    return inputs.map((input) => input.value.trim()).join("");
}

async function upsertRegistriertePerson(username, email, authUserId) {
    const personRow = {
        username: username,
        email: email,
        user_id: authUserId,
        verification_method: "einmalcode"
    };

    const { data: existingPerson, error: existingError } = await supabase
        .from("students")
        .select("email")
        .ilike("email", email)
        .maybeSingle();

    if (existingError) {
        throw new Error("Registrierungsdaten konnten nicht geprüft werden: " + existingError.message);
    }

    if (existingPerson) {
        const { error: updateError } = await supabase
            .from("students")
            .update(personRow)
            .eq("email", existingPerson.email);

        if (updateError) {
            throw new Error("Update in students fehlgeschlagen: " + updateError.message);
        }

        return;
    }

    const { error: insertError } = await supabase
        .from("students")
        .insert([personRow]);

    if (insertError) {
        throw new Error("Eintrag in students fehlgeschlagen: " + insertError.message);
    }
}

async function codeBestaetigen() {
    try {
        const username = getUsername();
        if (!username) {
            setMessage("Keine RZ-Kennung gefunden. Bitte zuerst über die Registrierung starten.", true);
            return;
        }

        if (!verifiedEmail) {
            verifiedEmail = buildHsEmail(username);
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

        const pending = readPendingRegistration();
        const pendingPassword = pending?.username === username ? pending?.password : null;

        if (!pendingPassword) {
            setMessage("Passwortdaten fehlen. Bitte Registrierung erneut starten.", true);
            return;
        }

        const { error: pwError } = await supabase.auth.updateUser({ password: pendingPassword });
        if (pwError) {
            setMessage("Code korrekt, aber Passwort konnte nicht gesetzt werden: " + pwError.message, true);
            return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user?.id) {
            setMessage("Code korrekt, aber Benutzer-ID konnte nicht gelesen werden.", true);
            return;
        }

        await upsertRegistriertePerson(username, verifiedEmail, userData.user.id);

        sessionStorage.removeItem("pending-registration");
        setMessage("Code bestätigt. Weiterleitung zum Studentenausweis...", false);
        window.location.href = "Studentenausweis.html";
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const username = getUsername();
    setIdentityPreview(username);

    const inputs = Array.from(document.querySelectorAll(".pin-input"));

    inputs.forEach((input, index) => {
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

    const btnAnfordern = document.getElementById("btn-code-anfordern");
    if (btnAnfordern) {
        btnAnfordern.addEventListener("click", codeAnfordern);
    }

    const btnBestaetigen = document.getElementById("btn-code-bestaetigen");
    if (btnBestaetigen) {
        btnBestaetigen.addEventListener("click", codeBestaetigen);
    }

    const modalOkButton = document.getElementById("code-modal-ok");
    if (modalOkButton) {
        modalOkButton.addEventListener("click", hideCodeModal);
    }

    const modalOverlay = document.getElementById("code-modal");
    if (modalOverlay) {
        modalOverlay.addEventListener("click", function (event) {
            if (event.target === modalOverlay) {
                hideCodeModal();
            }
        });
    }
});
