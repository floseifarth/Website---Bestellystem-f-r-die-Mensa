import { supabase } from "./supabaseClient.js";

function setMessage(text, isError) {
    const messageElement = document.getElementById("signup-message");
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function normalizeUsername(rawValue) {
    return (rawValue || "").trim().replace(/@hs-esslingen\.de$/i, "").toLowerCase();
}

function updateDerivedEmailField() {
    const usernameElement = document.getElementById("signup-username");
    const emailElement = document.getElementById("signup-email");
    if (!usernameElement || !emailElement) return;

    const username = normalizeUsername(usernameElement.value);
    emailElement.value = username ? username + "@hs-esslingen.de" : "@hs-esslingen.de";
}

function togglePasswordVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;

    button.addEventListener("click", function () {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";

        const eyeImg = button.querySelector("img");
        if (eyeImg) {
            eyeImg.src = isHidden ? "img/eye-off-icon.svg" : "img/eye-icon.svg";
            eyeImg.alt = isHidden ? "Passwort verbergen" : "Passwort anzeigen";
        }
    });
}

async function isAlreadyRegisteredInStudents(email) {
    const { data, error } = await supabase
        .from("students")
        .select("email")
        .ilike("email", email)
        .maybeSingle();

    if (error) {
        throw new Error("Registrierungsstatus konnte nicht geprüft werden: " + error.message);
    }

    return Boolean(data);
}

function isOtpUserMissingError(errorMessage) {
    const msg = String(errorMessage || "").toLowerCase();
    return msg.includes("signups not allowed for otp")
        || msg.includes("user not found")
        || msg.includes("not found");
}

async function isAlreadyRegisteredInAuth(email) {
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false }
    });

    if (!error) {
        return true;
    }

    if (isOtpUserMissingError(error.message)) {
        return false;
    }

    throw new Error("Registrierungsstatus im Login konnte nicht geprüft werden: " + error.message);
}

async function isAlreadyRegistered(email) {
    const existsInStudents = await isAlreadyRegisteredInStudents(email);
    if (existsInStudents) {
        return true;
    }

    return isAlreadyRegisteredInAuth(email);
}

async function registerAndRedirect() {
    const usernameElement = document.getElementById("signup-username");
    const passwordElement = document.getElementById("signup-password");
    const confirmElement = document.getElementById("signup-password-confirm");
    const signupButton = document.getElementById("signup-button");

    if (!usernameElement || !passwordElement || !confirmElement) {
        setMessage("Registrierungsformular konnte nicht geladen werden.", true);
        return;
    }

    const username = normalizeUsername(usernameElement.value);
    const password = passwordElement.value;
    const passwordConfirm = confirmElement.value;

    if (!username || !password || !passwordConfirm) {
        setMessage("Bitte alle Felder ausfüllen.", true);
        return;
    }

    if (password !== passwordConfirm) {
        setMessage("Passwörter stimmen nicht überein.", true);
        return;
    }

    if (password.length < 6) {
        setMessage("Passwort muss mindestens 6 Zeichen lang sein.", true);
        return;
    }

    const email = username + "@hs-esslingen.de";

    if (signupButton) {
        signupButton.disabled = true;
    }

    try {
        const alreadyRegistered = await isAlreadyRegistered(email);

        if (alreadyRegistered) {
            sessionStorage.removeItem("pending-registration");
            setMessage("Diese E-Mail ist bereits registriert. Weiterleitung zum Login...", true);
            setTimeout(function () {
                window.location.href = "Login.html?username=" + encodeURIComponent(username);
            }, 1400);
            return;
        }

        const pendingRegistration = {
            username,
            email,
            password,
            createdAt: Date.now()
        };

        sessionStorage.setItem("pending-registration", JSON.stringify(pendingRegistration));
        setMessage("Weiterleitung zur Identifizierung...", false);
        window.location.href = "Identifizierung.html?username=" + encodeURIComponent(username);
    } catch (error) {
        setMessage(error?.message || "Registrierung konnte nicht gestartet werden.", true);
    } finally {
        if (signupButton) {
            signupButton.disabled = false;
        }
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const params = new URLSearchParams(window.location.search);
    const prefilledUsername = normalizeUsername(params.get("username") || "");

    const usernameElement = document.getElementById("signup-username");
    const emailElement = document.getElementById("signup-email");

    if (emailElement) {
        emailElement.value = "@hs-esslingen.de";
    }

    if (usernameElement && prefilledUsername) {
        usernameElement.value = prefilledUsername;
    }

    if (usernameElement) {
        usernameElement.addEventListener("input", updateDerivedEmailField);
    }

    updateDerivedEmailField();

    const signupButton = document.getElementById("signup-button");
    if (signupButton) {
        signupButton.addEventListener("click", registerAndRedirect);
    }

    const passwordConfirmElement = document.getElementById("signup-password-confirm");
    if (passwordConfirmElement) {
        passwordConfirmElement.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                registerAndRedirect();
            }
        });
    }

    togglePasswordVisibility("signup-password", "show-signup-password");
    togglePasswordVisibility("signup-password-confirm", "show-signup-password-confirm");
});
