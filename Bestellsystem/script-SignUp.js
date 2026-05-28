function setMessage(text, isError) {
    const messageElement = document.getElementById("signup-message");
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.style.color = isError ? "#b42318" : "#027a48";
}

function normalizeUsername(rawValue) {
    return (rawValue || "").trim().replace(/@hs-esslingen\.de$/i, "").toLowerCase();
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

function registerAndRedirect() {
    const usernameElement = document.getElementById("signup-username");
    const passwordElement = document.getElementById("signup-password");
    const confirmElement = document.getElementById("signup-password-confirm");

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

    if (password.length < 8) {
        setMessage("Passwort muss mindestens 8 Zeichen lang sein.", true);
        return;
    }

    const email = username + "@hs-esslingen.de";

    const pendingRegistration = {
        username,
        email,
        password,
        createdAt: Date.now()
    };

    sessionStorage.setItem("pending-registration", JSON.stringify(pendingRegistration));
    setMessage("Weiterleitung zur Identifizierung...", false);

    window.location.href = "Identifizierung.html?username=" + encodeURIComponent(username);
}

document.addEventListener("DOMContentLoaded", function () {
    const params = new URLSearchParams(window.location.search);
    const prefilledUsername = normalizeUsername(params.get("username") || "");

    const usernameElement = document.getElementById("signup-username");
    if (usernameElement && prefilledUsername) {
        usernameElement.value = prefilledUsername;
    }

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
