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
        .from("RegistriertePersonen")
        .select("Vorname")
        .ilike("E-Mail", email)
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

    // Vorname aus Auth-Metadaten oder aus RegistriertePersonen ermitteln.
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

    // Bestellliste im HTML und gespeicherte Bestellungen aus localStorage holen
    const orderList = document.getElementById("order-list");
    const bestellungen = JSON.parse(localStorage.getItem("bestellungen")) || [];

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
        bestellungen.forEach(function (item, index) {
            const key = `${item.date}||${item.name}`;
            if (!gruppen[key]) {
                gruppen[key] = { ...item, kategorien: [], indices: [], priceByCategory: {} };
            }
            if (item.priceByCategory) {
                Object.assign(gruppen[key].priceByCategory, item.priceByCategory);
            }
            gruppen[key].kategorien.push({ label: item.category || 'Studierende', price: item.price });
            gruppen[key].priceByCategory[item.category || "Studierende"] = item.price;
            gruppen[key].indices.push(index);
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

                // Alle Einträge dieser Gruppe entfernen (von hinten, damit Indizes stimmen)
                gruppe.indices.slice().sort((a, b) => b - a).forEach(function (i) {
                    bestellungen.splice(i, 1);
                });
                localStorage.setItem("bestellungen", JSON.stringify(bestellungen));
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
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-plus" ${preisVerfuegbar ? "" : "disabled"}>+</button>
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-minus" ${(preisVerfuegbar && n > 0) ? "" : "disabled"}>-</button>
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
                                    date: gruppe.date,
                                    name: gruppe.name,
                                    image: gruppe.image,
                                    category: label,
                                    price: pricesByLabel[label],
                                    priceByCategory: { ...pricesByLabel }
                                });
                            }
                        });

                        gruppe.indices.slice().sort((a, b) => b - a).forEach(function (i) {
                            bestellungen.splice(i, 1);
                        });

                        bestellungen.push(...neueEintraege);
                        localStorage.setItem("bestellungen", JSON.stringify(bestellungen));
                        location.reload();
                    });
                };

                renderPreise();
            });

            orderList.appendChild(row);
            total += gruppenTotal;
        });



    }
});
