import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const STANDARD_KATEGORIEN = ["Studierende", "Bedienstete", "Gäste"];

function toEuroText(priceValue) {
    if (priceValue === null || priceValue === undefined || priceValue === "") {
        return "-";
    }
    if (typeof priceValue === "number") {
        return priceValue.toFixed(2).replace(".", ",") + " €";
    }
    if (typeof priceValue === "string") {
        return priceValue.includes("€") ? priceValue : `${priceValue} €`;
    }
    return String(priceValue);
}

function toIsoDateFromBestellDatum(bestellDatum) {
    const dateParts = String(bestellDatum || "").split(", ");
    const datumText = dateParts[1] || dateParts[0] || "";
    const isoMatch = datumText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const numerischMatch = datumText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (numerischMatch) {
        const tag = numerischMatch[1].padStart(2, "0");
        const monat = numerischMatch[2].padStart(2, "0");
        const jahrRoh = numerischMatch[3];
        const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
        return `${jahr}-${monat}-${tag}`;
    }

    const monate = {
        Januar: "01",
        Februar: "02",
        März: "03",
        April: "04",
        Mai: "05",
        Juni: "06",
        Juli: "07",
        August: "08",
        September: "09",
        Oktober: "10",
        November: "11",
        Dezember: "12"
    };

    const textMatch = datumText.match(/^(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{2}|\d{4})$/);
    if (!textMatch) {
        return null;
    }

    const tag = textMatch[1].padStart(2, "0");
    const monat = monate[textMatch[2]];
    const jahrRoh = textMatch[3];
    const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
    if (!monat) {
        return null;
    }

    return `${jahr}-${monat}-${tag}`;
}

function formatiereBestellDatumFuerAnzeige(bestellDatum) {
    const isoDatum = toIsoDateFromBestellDatum(bestellDatum);
    if (!isoDatum) {
        return String(bestellDatum || "");
    }

    const dateObj = new Date(`${isoDatum}T00:00:00`);
    if (Number.isNaN(dateObj.getTime())) {
        return String(bestellDatum || "");
    }

    const wochentag = WOCHENTAGE[dateObj.getDay()];
    const datumText = dateObj.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    return `${wochentag}, ${datumText}`;
}

async function ladeFehlendeKategorienpreise(gruppe) {
    const ausgabeDatum = toIsoDateFromBestellDatum(gruppe.date);
    if (!ausgabeDatum || !gruppe.name) {
        return {};
    }

    const { data, error } = await supabase
        .from("Speiseplan")
        .select("PreisStudierende, PreisBedienstet, PreisGast")
        .eq("Gerichtname", gruppe.name)
        .eq("Ausgabedatum", ausgabeDatum)
        .maybeSingle();

    if (error || !data) {
        return {};
    }

    return {
        Studierende: toEuroText(data.PreisStudierende),
        Bedienstete: toEuroText(data.PreisBedienstet),
        Gäste: toEuroText(data.PreisGast)
    };
}

async function ladeBestellungenAusDb(user) {
    const { data, error } = await supabase
        .from("Bestellungen")
        .select("id, bestell_datum, gericht_name, kategorie, preis, image_url")
        .eq("auth_user_id", user.id)
        .order("created_at", { ascending: true });

    if (error) {
        throw new Error("Bestellungen konnten nicht geladen werden: " + error.message);
    }

    return (data || []).map(function (row) {
        const isoDatum = toIsoDateFromBestellDatum(row.bestell_datum || "");
        return {
            id: row.id,
            date: formatiereBestellDatumFuerAnzeige(row.bestell_datum || ""),
            bestellIsoDate: isoDatum,
            name: row.gericht_name || "",
            category: row.kategorie || "Studierende",
            price: row.preis || "-",
            image: row.image_url || "",
            priceByCategory: {}
        };
    });
}

async function ermittleVorname(user) {
    const fullName = (user.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = (user.email || "").trim();
    if (!email) {
        return "Gast";
    }

    const { data, error } = await supabase
        .from("students")
        .select("Vorname")
        .ilike("email", email)
        .maybeSingle();

    if (!error && data?.Vorname) {
        return data.Vorname;
    }

    return email;
}


document.addEventListener("DOMContentLoaded", async function () {
    // Header-Datum initialisieren
    const heute = new Date();
    const wochentagHeute = WOCHENTAGE[heute.getDay()];
    const datumHeute = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentagHeute + ", " + datumHeute;
    }

    // Aktuelle Supabase-Session abrufen (gespeichert nach dem Login).
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "Anmeldestartseite.html";
        return;
    }

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    const displayName = await ermittleVorname(user);

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    // Preis von Zahl in deutsches Format umwandeln (z.B. 4.10 → "4,10 €")
    function formatPrice(amount) {
        return amount.toFixed(2).replace(".", ",") + " €";
    }

    // Preis aus Text in Zahl umwandeln (z.B. "4,10 €" → 4.1)
    function parsePrice(priceText) {
        const cleaned = priceText.replace(/[^\d,.-]/g, "");
        return Number(cleaned.replace(",", "."));
    }

    // Numerisches Datum umwandeln (z.B. "16.05.2026" → "16. Mai 2026")
    function formatDatum(datumStr) {
        const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const match = datumStr.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
        if (!match) return datumStr;
        return `${match[1].padStart(2, '0')}. ${monate[parseInt(match[2], 10) - 1]} ${match[3]}`;
    }

    //Pop-Up Fenster zur Bestätigung der Stornierung
    function StornierungMitEigenemModal(frage) {
        return new Promise(function (resolve) {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";

            const dialog = document.createElement("div");
            dialog.className = "modal-dialog";
            dialog.innerHTML = `
                <p class="modal-text">${frage}</p>
                <div class="modal-actions">
                    <button type="button" class="modal-nein">Abbrechen</button>
                    <button type="button" class="modal-ja">Ja, stornieren</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            dialog.querySelector(".modal-nein").addEventListener("click", function () {
                overlay.remove();
                resolve(false);
            });

            dialog.querySelector(".modal-ja").addEventListener("click", function () {
                overlay.remove();
                resolve(true);
            });
        });
    }

    // Bestellliste im HTML und gespeicherte Bestellungen aus der DB laden
    const orderList = document.getElementById("order-list");
    let bestellungen = [];

    try {
        bestellungen = await ladeBestellungenAusDb(user);
    } catch (error) {
        alert(error.message || "Bestellungen konnten nicht geladen werden.");
    }

    if (!orderList) return;

    // Liste leeren bevor neu befüllt wird
    orderList.innerHTML = "";

    if (bestellungen.length === 0) {
        // Platzhalter anzeigen wenn keine Bestellungen vorhanden
        const emptyRow = document.createElement("div");
        emptyRow.className = "bestell-zeile";
        emptyRow.innerText = "Noch keine Vorbestellung.";
        orderList.appendChild(emptyRow);
    } else {
        let total = 0;

        // Bestellungen nach Datum + Gericht gruppieren
        const gruppen = {};
        bestellungen.forEach(function (item) {
            const key = `${item.date}||${item.name}`;
            if (!gruppen[key]) {
                gruppen[key] = { ...item, kategorien: [], ids: [], priceByCategory: {} };
            }
            if (!gruppen[key].bestellIsoDate && item.bestellIsoDate) {
                gruppen[key].bestellIsoDate = item.bestellIsoDate;
            }
            if (item.priceByCategory) {
                Object.assign(gruppen[key].priceByCategory, item.priceByCategory);
            }
            gruppen[key].kategorien.push({ label: item.category || 'Studierende', price: item.price });
            gruppen[key].priceByCategory[item.category || "Studierende"] = item.price;
            if (item.id !== undefined && item.id !== null) {
                gruppen[key].ids.push(item.id);
            }
        });

        const sortierteGruppen = Object.values(gruppen).sort(function (a, b) {
            const datumA = toIsoDateFromBestellDatum(a.date) || "9999-12-31";
            const datumB = toIsoDateFromBestellDatum(b.date) || "9999-12-31";

            if (datumA !== datumB) {
                return datumA.localeCompare(datumB);
            }

            return (a.name || "").localeCompare(b.name || "", "de");
        });

        sortierteGruppen.forEach(function (gruppe) {
            const dateParts = (gruppe.date || '').split(', ');
            const wochentag = dateParts[0] || '';
            const datumText = formatDatum(dateParts[1] || '');

            // Kategorien zählen und Preise summieren
            const counts = {};
            let gruppenTotal = 0;
            gruppe.kategorien.forEach(function (k) {
                counts[k.label] = (counts[k.label] || 0) + 1;
                gruppenTotal += parsePrice(k.price);
            });
            const kategorieText = Object.entries(counts).map(([label, n]) => `${n}x ${label}`).join(', ');

            const row = document.createElement("div");
            row.className = "speiseplan-eintrag";
            row.innerHTML = `
                <div class="speiseplan-links">
                    <h3>${wochentag}</h3>
                    <p>${datumText}</p>
                </div>
                <div class="speiseplan-mitte">
                    <img src="${gruppe.image || ''}" class="gericht-bild" alt="">
                    <p>Tagesangebot</p>
                    <h3>${gruppe.name || ''}</h3>
                    <div class="preise">
                        <div class="preise-liste">
                            ${Object.entries(counts).map(function ([label, n]) {
                return `<p class="preise-zeile">${n}x ${label}</p>`;
            }).join("")}
                        </div>
                        <p>Gesamt: <strong>${formatPrice(gruppenTotal)}</strong></p>
                    </div>
                </div>
                <div class="speiseplan-rechts">
                    <button type="button" class="vorbestell-btn remove-button">Stornieren</button>
    
                    <button type="button" class="vorbestell-btn edit-button">Bearbeiten</button>
                </div>`;
            // Stornieren-Button mit Bestätigungs-Popup verknüpfen
            row.querySelector(".remove-button").addEventListener("click", async function () {
                const bestaetigt = await StornierungMitEigenemModal("Möchtest du diese Bestellung wirklich stornieren?");
                if (!bestaetigt) {
                    return;
                }

                const idsToDelete = gruppe.ids || [];
                if (idsToDelete.length === 0) {
                    alert("Diese Bestellung konnte nicht eindeutig zugeordnet werden.");
                    return;
                }

                const { error: deleteError } = await supabase
                    .from("Bestellungen")
                    .delete()
                    .in("id", idsToDelete)
                    .eq("auth_user_id", user.id);

                if (deleteError) {
                    alert("Stornieren fehlgeschlagen: " + deleteError.message);
                    return;
                }

                location.reload();
            });
            // Bearbeiten-Button: Mengen direkt im Eintrag anpassen.
            row.querySelector(".edit-button").addEventListener("click", async function () {
                const preiseContainer = row.querySelector(".preise");
                if (!preiseContainer) {
                    return;
                }

                const bestehendeControls = preiseContainer.querySelector(".inline-edit-controls");
                if (bestehendeControls) {
                    return;
                }

                const fehlendePreise = await ladeFehlendeKategorienpreise(gruppe);
                if (Object.keys(fehlendePreise).length > 0) {
                    gruppe.priceByCategory = {
                        ...(gruppe.priceByCategory || {}),
                        ...fehlendePreise
                    };
                }

                const countsEdit = {};
                const pricesByLabel = {};
                STANDARD_KATEGORIEN.forEach(function (label) {
                    countsEdit[label] = 0;

                    const gespeicherterPreis = gruppe.priceByCategory?.[label];
                    if (gespeicherterPreis && gespeicherterPreis !== "-") {
                        pricesByLabel[label] = gespeicherterPreis;
                    }
                });

                gruppe.kategorien.forEach(function (k) {
                    const label = k.label || "Studierende";
                    countsEdit[label] = (countsEdit[label] || 0) + 1;
                    if (!pricesByLabel[label] && k.price && k.price !== "-") {
                        pricesByLabel[label] = k.price;
                    }
                });

                const renderPreise = function () {
                    let gruppenTotalNeu = 0;
                    Object.entries(countsEdit).forEach(function ([label, n]) {
                        if (n > 0) {
                            gruppenTotalNeu += parsePrice(pricesByLabel[label]) * n;
                        }
                    });

                    const kategorieZeilen = STANDARD_KATEGORIEN
                        .map(function (label) {
                            const n = countsEdit[label] || 0;
                            const preisVerfuegbar = Boolean(pricesByLabel[label] && pricesByLabel[label] !== "-");

                            return `
                                <div class="inline-edit-row" data-label="${label}">
                                    <p class="inline-edit-label">${n}x ${label}</p>
                                    <div class="inline-edit-actions">
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-minus" ${(preisVerfuegbar && n > 0) ? "" : "disabled"}>-</button>
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-plus" ${preisVerfuegbar ? "" : "disabled"}>+</button>
                                    </div>
                                </div>
                            `;
                        })
                        .join("");

                    preiseContainer.innerHTML = `
                        <div class="preise-liste inline-edit-controls">${kategorieZeilen}</div>
                        <p>Gesamt: <strong>${formatPrice(gruppenTotalNeu)}</strong></p>
                        <div class="inline-edit-footer">
                            <button type="button" class="vorbestell-btn inline-save">Speichern</button>
                            <button type="button" class="vorbestell-btn inline-cancel">Abbrechen</button>
                        </div>
                    `;

                    attachInlineListeners();
                };

                const attachInlineListeners = function () {
                    preiseContainer.querySelectorAll(".inline-edit-row").forEach(function (editRow) {
                        const label = editRow.getAttribute("data-label") || "";
                        const minusBtn = editRow.querySelector(".inline-minus");
                        const plusBtn = editRow.querySelector(".inline-plus");

                        if (minusBtn && !minusBtn.disabled) {
                            minusBtn.addEventListener("click", function () {
                                countsEdit[label] = Math.max(0, (countsEdit[label] || 0) - 1);
                                renderPreise();
                            });
                        }

                        if (plusBtn && !plusBtn.disabled) {
                            plusBtn.addEventListener("click", function () {
                                countsEdit[label] = (countsEdit[label] || 0) + 1;
                                renderPreise();
                            });
                        }
                    });

                    preiseContainer.querySelector(".inline-cancel").addEventListener("click", function () {
                        location.reload();
                    });

                    preiseContainer.querySelector(".inline-save").addEventListener("click", function () {
                        const neueEintraege = [];
                        Object.entries(countsEdit).forEach(function ([label, n]) {
                            for (let i = 0; i < n; i += 1) {
                                neueEintraege.push({
                                    auth_user_id: user.id,
                                    email: user.email || "",
                                    gericht_name: gruppe.name,
                                    bestell_datum: gruppe.bestellIsoDate || toIsoDateFromBestellDatum(gruppe.date),
                                    kategorie: label,
                                    preis: pricesByLabel[label],
                                    image_url: gruppe.image || ""
                                });
                            }
                        });

                        const idsToReplace = gruppe.ids || [];
                        if (idsToReplace.length === 0) {
                            alert("Diese Bestellung konnte nicht eindeutig zugeordnet werden.");
                            return;
                        }

                        supabase
                            .from("Bestellungen")
                            .delete()
                            .in("id", idsToReplace)
                            .eq("auth_user_id", user.id)
                            .then(async function ({ error: deleteError }) {
                                if (deleteError) {
                                    alert("Bearbeiten fehlgeschlagen: " + deleteError.message);
                                    return;
                                }

                                if (neueEintraege.length === 0) {
                                    location.reload();
                                    return;
                                }

                                const { error: insertError } = await supabase
                                    .from("Bestellungen")
                                    .insert(neueEintraege);

                                if (insertError) {
                                    alert("Bearbeiten fehlgeschlagen: " + insertError.message);
                                    return;
                                }

                                location.reload();
                            });
                    });
                };

                renderPreise();
            });

            orderList.appendChild(row);
            total += gruppenTotal;
        });



    }
});
