import { supabase } from "./supabaseClient.js";

const urlParams = new URLSearchParams(window.location.search);
let recoverySessionAvailable = false;

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function setMessage(text, isError) {
    const messageElement = document.getElementById("reset-message");
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function buildHsEmailFromInput(rawInput) {
    const cleaned = normalizeText(rawInput);
    if (!cleaned) {
        return "";
    }
    if (cleaned.includes("@")) {
        return cleaned;
    }
    return cleaned + "@hs-esslingen.de";
}

function getUsernameInput() {
    const input = document.getElementById("reset-username");
    return input ? input.value : "";
}

function getCurrentEmail() {
    return buildHsEmailFromInput(getUsernameInput());
}

function setEmailPreview() {
    const preview = document.getElementById("reset-email-preview");
    if (!preview) return;
    const email = getCurrentEmail();
    preview.textContent = email || "-";
}

function clearRecoveryParamsFromUrl() {
    const username = normalizeText(getUsernameInput());
    const nextUrl = username
        ? "Passwort-zuruecksetzen.html?username=" + encodeURIComponent(username)
        : "Passwort-zuruecksetzen.html";
    window.history.replaceState({}, "", nextUrl);
}

async function activateRecoverySessionFromUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const typeFromHash = hash.get("type");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (typeFromHash === "recovery" && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        if (!error) {
            recoverySessionAvailable = true;
            window.history.replaceState({}, "", window.location.pathname + window.location.search);
            return true;
        }
    }

    const tokenHash = urlParams.get("token_hash");
    const typeFromQuery = urlParams.get("type");
    const emailFromQuery = normalizeText(urlParams.get("email") || "");

    if (tokenHash && typeFromQuery === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
            email: emailFromQuery || undefined
        });

        if (!error) {
            recoverySessionAvailable = true;
            clearRecoveryParamsFromUrl();
            return true;
        }
    }

    return false;
}

async function sendResetCode() {
    const sendCodeButton = document.getElementById("btn-send-reset-code");
    const originalButtonText = sendCodeButton ? sendCodeButton.textContent : "";

    try {
        const email = getCurrentEmail();
        if (!email) {
            setMessage("Bitte zuerst Ihre RZ-Kennung eingeben.", true);
            return;
        }

        if (sendCodeButton) {
            sendCodeButton.disabled = true;
            sendCodeButton.textContent = "Bitte warten...";
        }

        setMessage("Einmalcode wird gesendet...", false);

        const { error } = await supabase.auth.resetPasswordForEmail(email);

        if (error) {
            setMessage("Code konnte nicht gesendet werden: " + error.message, true);
            return;
        }

        setMessage("Einmalcode gesendet. Bitte E-Mail-Postfach prüfen.", false);
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    } finally {
        if (sendCodeButton) {
            sendCodeButton.disabled = false;
            sendCodeButton.textContent = originalButtonText || "Einmalcode senden";
        }
    }
}

async function changePassword() {
    try {
        const email = getCurrentEmail();
        const otpCode = String(document.getElementById("reset-code")?.value || "").trim();
        const password = String(document.getElementById("reset-new-password")?.value || "");
        const passwordRepeat = String(document.getElementById("reset-new-password-repeat")?.value || "");

        if (!email) {
            setMessage("Bitte zuerst Ihre RZ-Kennung eingeben.", true);
            return;
        }

        if (!password || !passwordRepeat) {
            setMessage("Bitte neues Passwort vollständig eingeben.", true);
            return;
        }

        if (password.length < 6) {
            setMessage("Passwort muss mindestens 6 Zeichen haben.", true);
            return;
        }

        if (password !== passwordRepeat) {
            setMessage("Passwörter stimmen nicht überein.", true);
            return;
        }

        setMessage("Passwort wird geändert...", false);

        if (otpCode) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token: otpCode,
                type: "recovery"
            });

            if (verifyError) {
                setMessage("Einmalcode ungültig oder abgelaufen: " + verifyError.message, true);
                return;
            }
            recoverySessionAvailable = true;
        } else {
            const recoveryReady = recoverySessionAvailable || await activateRecoverySessionFromUrl();
            if (!recoveryReady) {
                setMessage("Bitte Einmalcode eingeben oder den Reset-Link aus der E-Mail öffnen.", true);
                return;
            }
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            setMessage("Passwort konnte nicht geändert werden: " + updateError.message, true);
            return;
        }

        setMessage("Passwort erfolgreich geändert. Weiterleitung zum Login...", false);
        window.setTimeout(function () {
            window.location.href = "Login.html";
        }, 1200);
    } catch (error) {
        setMessage("Unerwarteter Fehler: " + (error?.message || String(error)), true);
    }
}

function initPage() {
    const usernameInput = document.getElementById("reset-username");
    const sendCodeButton = document.getElementById("btn-send-reset-code");
    const resetButton = document.getElementById("btn-reset-password");

    const usernameFromUrl = normalizeText(urlParams.get("username") || "");
    if (usernameInput && usernameFromUrl) {
        usernameInput.value = usernameFromUrl;
    }

    setEmailPreview();

    if (usernameInput) {
        usernameInput.addEventListener("input", setEmailPreview);
    }

    if (sendCodeButton) {
        sendCodeButton.addEventListener("click", sendResetCode);
    }

    if (resetButton) {
        resetButton.addEventListener("click", changePassword);
    }

    activateRecoverySessionFromUrl().then(function (ready) {
        if (ready) {
            setMessage("Reset-Link erkannt. Sie können jetzt ein neues Passwort setzen.", false);
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage);
} else {
    initPage();
}
