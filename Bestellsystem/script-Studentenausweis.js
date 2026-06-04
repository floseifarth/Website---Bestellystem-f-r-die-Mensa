import { supabase } from "./supabaseClient.js";

let currentPreviewUrl = null;
let selectedFileDataUrl = "";

async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
    });
}

function setMessage(text, isError = false) {
    const element = document.getElementById("studentenausweis-message");
    if (!element) return;
    element.textContent = text;
    element.style.color = isError ? "#b42318" : "#027a48";
}

function pickFirstNonEmpty(candidates) {
    for (const value of candidates) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return "";
}

function mapOcrResultToFields(rawData) {
    const data = rawData && typeof rawData === "object" ? rawData : {};

    const vorname = pickFirstNonEmpty([
        data.vorname,
        data.firstName,
        data.firstname,
        data.givenName,
        data.given_name,
        data.name?.vorname,
        data.name?.firstName,
        data.person?.vorname,
        data.person?.firstName
    ]);

    const nachname = pickFirstNonEmpty([
        data.nachname,
        data.lastName,
        data.lastname,
        data.familyName,
        data.family_name,
        data.name?.nachname,
        data.name?.lastName,
        data.person?.nachname,
        data.person?.lastName
    ]);

    const matrikelnummer = pickFirstNonEmpty([
        data.matrikelnummer,
        data.matrikel,
        data.studentNumber,
        data.student_number,
        data.matriculationNumber,
        data.matriculation_number,
        data.person?.matrikelnummer,
        data.person?.studentNumber
    ]);

    return { vorname, nachname, matrikelnummer };
}

async function invokeReadStudentCard(file) {
    const base64DataUrl = await readFileAsDataUrl(file);

    const imageBase64 = base64DataUrl.includes(",")
        ? base64DataUrl.split(",")[1]
        : base64DataUrl;

    const response = await supabase.functions.invoke("read-student-card-websitetest", {
        body: {
            imageBase64
        }
    });

    if (response.error) {
        throw new Error(response.error.message || "Edge Function konnte nicht ausgeführt werden.");
    }

    return response.data;
}

function applyExtractedFields(fields) {
    const vornameInput = document.getElementById("login-vorname");
    const nachnameInput = document.getElementById("login-nachname");
    const matrikelInput = document.getElementById("login-matrikelnummer");

    if (vornameInput && fields.vorname) vornameInput.value = fields.vorname;
    if (nachnameInput && fields.nachname) nachnameInput.value = fields.nachname;
    if (matrikelInput && fields.matrikelnummer) matrikelInput.value = fields.matrikelnummer;
}

function clearUploadPreview() {
    const preview = document.getElementById("upload-preview");
    const previewImage = document.getElementById("upload-preview-image");
    const previewName = document.getElementById("upload-preview-name");
    const openButton = document.getElementById("upload-open");

    if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = null;
    }

    if (previewImage) {
        previewImage.src = "";
        previewImage.classList.add("is-hidden");
    }

    if (previewName) {
        previewName.textContent = "";
    }

    if (preview) {
        preview.classList.add("is-hidden");
    }

    if (openButton) {
        openButton.textContent = "Bild auswählen";
    }

    selectedFileDataUrl = "";
}

function showUploadPreview(file) {
    const preview = document.getElementById("upload-preview");
    const previewImage = document.getElementById("upload-preview-image");
    const previewName = document.getElementById("upload-preview-name");
    if (!preview || !previewImage || !previewName) return;

    clearUploadPreview();

    previewName.textContent = "Datei: " + (file.name || "Unbenannt");

    if (file.type && file.type.startsWith("image/")) {
        currentPreviewUrl = URL.createObjectURL(file);
        previewImage.src = currentPreviewUrl;
        previewImage.classList.remove("is-hidden");
    }

    preview.classList.remove("is-hidden");

    const openButton = document.getElementById("upload-open");
    if (openButton) {
        openButton.textContent = "Anderes Bild auswählen";
    }
}

async function processSelectedFile(file) {
    if (!file) {
        clearUploadPreview();
        setFormLocked(true);
        setMessage("");
        return;
    }

    setFormLocked(false);
    showUploadPreview(file);
    selectedFileDataUrl = await readFileAsDataUrl(file);

    try {
        setMessage("Ausweis wird ausgelesen...");
        const data = await invokeReadStudentCard(file);
        const fields = mapOcrResultToFields(data);
        applyExtractedFields(fields);

        if (!fields.vorname && !fields.nachname && !fields.matrikelnummer) {
            setMessage("Auslesen war erfolgreich, aber es wurden keine eindeutigen Felder erkannt.", true);
            return;
        }

        setMessage("Daten wurden aus dem Ausweis übernommen.");
    } catch (error) {
        setMessage("Auslesen fehlgeschlagen: " + (error?.message || String(error)), true);
    }
}

function getTrimmedInputValue(id) {
    const element = document.getElementById(id);
    return element ? String(element.value || "").trim() : "";
}

function setFormLocked(isLocked) {
    const ids = ["login-vorname", "login-nachname", "login-matrikelnummer"];

    ids.forEach(function (id) {
        const element = document.getElementById(id);
        if (!element) return;
        element.disabled = isLocked;
    });

    const saveButton = document.getElementById("registrier-button");
    if (saveButton) {
        saveButton.disabled = isLocked;
    }
}

async function saveStudentCardData() {
    try {
        const vorname = getTrimmedInputValue("login-vorname");
        const nachname = getTrimmedInputValue("login-nachname");
        const matrikelnummerRaw = getTrimmedInputValue("login-matrikelnummer");
        const matrikelnummer = matrikelnummerRaw.replace(/\s+/g, "");

        if (!vorname || !nachname || !matrikelnummer) {
            setMessage("Bitte Vorname, Nachname und Matrikelnummer ausfüllen.", true);
            return;
        }

        if (!/^\d{5,12}$/.test(matrikelnummer)) {
            setMessage("Matrikelnummer muss aus 5 bis 12 Ziffern bestehen.", true);
            return;
        }

        if (!selectedFileDataUrl) {
            setMessage("Bitte zuerst ein Ausweisbild hochladen.", true);
            return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            throw new Error("Session konnte nicht geladen werden: " + sessionError.message);
        }

        const user = sessionData?.session?.user;
        if (!user) {
            setMessage("Bitte zuerst anmelden.", true);
            window.location.href = "Anmeldestartseite.html";
            return;
        }

        setMessage("Daten werden gespeichert...");

        const payload = {
            user_id: user.id,
            email: user.email || null,
            vorname,
            nachname,
            matrikelnummer,
            ausweisbild: selectedFileDataUrl
        };

        const { data: existingRow, error: existingError } = await supabase
            .from("students")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (existingError) {
            throw new Error("students konnte nicht geprüft werden: " + existingError.message);
        }

        if (existingRow) {
            const { error: updateError } = await supabase
                .from("students")
                .update(payload)
                .eq("user_id", user.id);

            if (updateError) {
                throw new Error("Daten konnten nicht aktualisiert werden: " + updateError.message);
            }
        } else {
            const { error: insertError } = await supabase
                .from("students")
                .insert([payload]);

            if (insertError) {
                throw new Error("Daten konnten nicht gespeichert werden: " + insertError.message);
            }
        }

        setMessage("Daten erfolgreich gespeichert. Weiterleitung...");
        window.location.href = "startseite.html";
    } catch (error) {
        setMessage("Speichern fehlgeschlagen: " + (error?.message || String(error)), true);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const uploadInput = document.getElementById("studentenausweis-upload");
    const clearButton = document.getElementById("upload-clear");
    const openButton = document.getElementById("upload-open");
    const dropzone = document.getElementById("upload-dropzone");
    const saveButton = document.getElementById("registrier-button");

    if (!uploadInput) {
        return;
    }

    setFormLocked(true);

    if (clearButton) {
        clearButton.addEventListener("click", function () {
            uploadInput.value = "";
            clearUploadPreview();
            setFormLocked(true);
            setMessage("");
        });
    }

    if (openButton) {
        openButton.addEventListener("click", function () {
            uploadInput.click();
        });
    }

    if (dropzone) {
        const markDragOver = function (event) {
            event.preventDefault();
            dropzone.classList.add("is-dragover");
        };

        const clearDragOver = function (event) {
            event.preventDefault();
            dropzone.classList.remove("is-dragover");
        };

        dropzone.addEventListener("dragenter", markDragOver);
        dropzone.addEventListener("dragover", markDragOver);
        dropzone.addEventListener("dragleave", clearDragOver);

        dropzone.addEventListener("drop", async function (event) {
            event.preventDefault();
            dropzone.classList.remove("is-dragover");

            const file = event.dataTransfer?.files?.[0];
            if (!file) {
                return;
            }

            await processSelectedFile(file);
        });
    }

    uploadInput.addEventListener("change", async function () {
        const file = uploadInput.files?.[0];
        await processSelectedFile(file);
    });

    if (saveButton) {
        saveButton.addEventListener("click", saveStudentCardData);
    }
});
