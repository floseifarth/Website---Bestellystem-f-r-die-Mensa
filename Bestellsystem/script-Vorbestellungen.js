import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext } from "./userContext.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MAX_GERICHTE_PRO_TAG = 3;
const TEST_BESTELLUNG_HEUTE_AKTIV = true;
const CATEGORY_BY_PRICE_KEY = {
    stud: "Studierende",
    bed: "Bedienstete",
    guest: "Gäste"
};

function ermittleBestellzeitraum() {
    if (TEST_BESTELLUNG_HEUTE_AKTIV) {
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        return { startDate: heute, endDate: new Date(heute) };
    }

    const startDate = ermittleStartDerUebernaechstenWoche();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 4);
    return { startDate, endDate };
}
async function aktualisiereBestellstatusHeader(userId) {
    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    const heute = new Date();
    const isoHeute = heute.getFullYear() + "-" +
        String(heute.getMonth() + 1).padStart(2, "0") + "-" +
        String(heute.getDate()).padStart(2, "0");

    const { data } = await supabase
        .from("Bestellungen")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("bestell_datum", isoHeute)
        .limit(1);

    const hatBestellung = Array.isArray(data) && data.length > 0;
    const stunde = heute.getHours();
    const minute = heute.getMinutes();
    const zeitInMinuten = stunde * 60 + minute;
    const ist1200 = 12 * 60;
    const ist1330 = 13 * 60 + 30;

    badge.style.display = "inline-block";
    badge.className = "bestellstatus-badge";

    if (zeitInMinuten >= ist1200 && zeitInMinuten < ist1330) {
        badge.classList.add("badge-essensvergabe");
        badge.textContent = "Essensvergabe";
    } else if (hatBestellung) {
        badge.classList.add("badge-vorbestellt");
        badge.textContent = "Vorbestellt";
    } else {
        badge.classList.add("badge-keine");
        badge.textContent = "Keine aktive Bestellung";
    }
}
function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parsePrice(priceText) {
    const cleaned = String(priceText || "").replace(/[^\d,.-]/g, "");
    return Number(cleaned.replace(",", "."));
}

function formatPrice(amount) {
    return amount.toFixed(2).replace(".", ",") + " €";
}

function toEuroText(priceValue) {
    if (priceValue === null || priceValue === undefined || priceValue === "") {
        return "-";
    }
    if (typeof priceValue === "number") {
        return formatPrice(priceValue);
    }
    if (typeof priceValue === "string") {
        return priceValue.includes("€") ? priceValue : `${priceValue} €`;
    }
    return String(priceValue);
}

function normalizeErnaehrungstyp(rawValue) {
    const text = String(rawValue || "")
        .trim()
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");

    if (!text) {
        return null;
    }
    if (text.includes("vegan")) {
        return "vegan";
    }
    if (text.includes("nicht vegetarisch") || text.includes("nicht-vegetarisch") || text.includes("fleisch")) {
        return "nicht vegetarisch";
    }
    if (text.includes("vegetar")) {
        return "vegetarisch";
    }

    return null;
}

function renderErnaehrungsBadge(rawValue) {
    const normalized = normalizeErnaehrungstyp(rawValue);
    if (!normalized) {
        return "";
    }

    const classMap = {
        vegan: "ernaehrung-vegan",
        vegetarisch: "ernaehrung-vegetarisch",
        "nicht vegetarisch": "ernaehrung-nicht-vegetarisch"
    };

    return `<span class="ernaehrung-badge ${classMap[normalized]}">${normalized}</span>`;
}

function ermittleStartDerUebernaechstenWoche() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Von heute aus zum naechsten Montag und dann eine weitere Woche vor.
    const day = today.getDay();
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day;

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + daysUntilNextMonday + 7);
    return startDate;
}

function formatiereAnzeigeDatum(date) {
    return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    const heute = new Date();
    const wochentag = WOCHENTAGE[heute.getDay()];
    const datum = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentag + ", " + datum;
    }

    const userContext = await loadCurrentUserContext();
    const user = userContext.user;

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = userContext.displayName;

    }
    aktualisiereBestellstatusHeader(user.id);
    let orderItems = [];
    let bestehendeBestellungenProTag = {};
    let orderUiSyncCallbacks = [];

    async function ladeAlleBestehendenBestellungenProTag(userId) {
        const { data, error } = await supabase
            .from("Bestellungen")
            .select("bestell_datum")
            .eq("auth_user_id", userId);

        if (error) {
            throw new Error("Bestellmengen konnten nicht geprüft werden: " + error.message);
        }

        const counts = {};
        (data || []).forEach(function (row) {
            const isoDate = row.bestell_datum;
            if (!isoDate) return;
            counts[isoDate] = (counts[isoDate] || 0) + 1;
        });
        return counts;
    }

    function zaehleEintraegeProTag(items) {
        const counts = {};
        (items || []).forEach(function (item) {
            const isoDate = item.bestellIsoDate;
            if (!isoDate) return;
            counts[isoDate] = (counts[isoDate] || 0) + 1;
        });
        return counts;
    }

    function updateOrderSummary() {
        const orderList = document.getElementById("order-list");
        const totalElement = document.getElementById("order-total");
        if (!orderList || !totalElement) return;

        orderList.innerHTML = "";
        let total = 0;

        if (orderItems.length === 0) {
            const emptyRow = document.createElement("div");
            emptyRow.className = "bestell-zeile";
            emptyRow.innerText = "Noch keine Vorbestellung.";
            orderList.appendChild(emptyRow);
        } else {
            orderItems.forEach(function (item) {
                const row = document.createElement("div");
                row.className = "bestell-zeile";
                row.innerHTML = `<div class="gerichts-info">
                    <div class="gerichtnamezeile">
                        <span>1x ${item.name}<br>${item.date}</span>
                        <span class="preis">${item.price}</span>
                        <button class="remove-button" type="button">x</button>
                    </div>
                </div>`;

                const removeButton = row.querySelector(".remove-button");
                if (removeButton) {
                    removeButton.addEventListener("click", function () {
                        orderItems = orderItems.filter(i => i !== item);
                        updateOrderSummary();
                    });
                }

                orderList.appendChild(row);
                total += parsePrice(item.price);
            });
        }

        totalElement.innerText = formatPrice(total);

        orderUiSyncCallbacks.forEach(function (syncCallback) {
            try {
                syncCallback();
            } catch (error) {
                console.warn("Order-UI Sync fehlgeschlagen:", error);
            }
        });
    }

    function countOrderItemsForSelection(dish, selectedPriceKey) {
        const selectedCategory = CATEGORY_BY_PRICE_KEY[selectedPriceKey];
        if (!selectedCategory) {
            return 0;
        }

        return orderItems.filter(function (item) {
            return item.bestellIsoDate === dish.isoDate
                && item.name === dish.name
                && item.category === selectedCategory;
        }).length;
    }

    function addOrderItem(dish, selectedPriceKey) {
        // Preis und Kategorie werden ueber den gewaelten Radio-Key aufgeloest.
        const priceMap = {
            stud: dish.priceStud,
            bed: dish.priceBed,
            guest: dish.priceGuest
        };

        const selectedPrice = priceMap[selectedPriceKey];
        const selectedCategory = CATEGORY_BY_PRICE_KEY[selectedPriceKey];

        if (!selectedPrice || selectedPrice === "-") {
            alert("Für diese Kategorie ist aktuell kein Preis hinterlegt.");
            return false;
        }

        const bestehendeAnzahl = bestehendeBestellungenProTag[dish.isoDate] || 0;
        const anzahlImWarenkorb = orderItems.filter(function (item) {
            return item.bestellIsoDate === dish.isoDate;
        }).length;

        if (bestehendeAnzahl + anzahlImWarenkorb >= MAX_GERICHTE_PRO_TAG) {
            alert(`Maximal ${MAX_GERICHTE_PRO_TAG} Gerichte pro Tag erlaubt.`);
            return false;
        }

        orderItems.push({
            date: dish.datumText,
            bestellIsoDate: dish.isoDate,
            name: dish.name,
            price: selectedPrice,
            category: selectedCategory,
            image: dish.image,
            priceByCategory: {
                Studierende: dish.priceStud,
                Bedienstete: dish.priceBed,
                Gäste: dish.priceGuest
            }
        });

        updateOrderSummary();
        return true;
    }

    function removeOrderItem(dish, selectedPriceKey) {
        const selectedCategory = CATEGORY_BY_PRICE_KEY[selectedPriceKey];
        if (!selectedCategory) {
            return false;
        }

        const index = orderItems.findIndex(function (item) {
            return item.bestellIsoDate === dish.isoDate
                && item.name === dish.name
                && item.category === selectedCategory;
        });

        if (index === -1) {
            return false;
        }

        orderItems.splice(index, 1);
        updateOrderSummary();
        return true;
    }

    function ladeGerichtzeitraum() {
        const zeitraum = ermittleBestellzeitraum();
        const startDate = zeitraum.startDate;
        const endDate = zeitraum.endDate;

        const anzeigeElement = document.getElementById("GerichtanzeigeDatum");
        if (anzeigeElement) {
            const startString = formatiereAnzeigeDatum(startDate);
            const endString = formatiereAnzeigeDatum(endDate);
            if (TEST_BESTELLUNG_HEUTE_AKTIV) {
                anzeigeElement.innerText = `Testmodus aktiv: Gerichte für heute (${startString})`;
            } else {
                anzeigeElement.innerText = `Gerichte für den Zeitraum: ${startString} - ${endString}`;
            }
        }
    }

    async function ladeGerichteDerUebernaechstenWoche() {
        const zeitraum = ermittleBestellzeitraum();
        const startDate = zeitraum.startDate;
        const endDate = zeitraum.endDate;

        const startIsoDate = toIsoDate(startDate);
        const endIsoDate = toIsoDate(endDate);

        const { data, error } = await supabase
            .from("Speiseplan")
            .select("*")
            .gte("Ausgabedatum", startIsoDate)
            .lte("Ausgabedatum", endIsoDate)
            .order("Ausgabedatum", { ascending: true });

        const container = document.getElementById("speiseplan-container");
        if (!container) return;

        container.innerHTML = "";
        orderUiSyncCallbacks = [];

        if (error) {
            console.error("Fehler beim Laden der Vorbestellungs-Gerichte:", error);
            container.innerHTML = "<p>Gerichte konnten nicht geladen werden.</p>";
            return;
        }

        if (!data || data.length === 0) {
            if (TEST_BESTELLUNG_HEUTE_AKTIV) {
                container.innerHTML = "<p>Für heute sind aktuell keine Gerichte eingetragen.</p>";
            } else {
                container.innerHTML = "<p>Für die übernächste Woche (Mo-Fr) sind aktuell keine Gerichte eingetragen.</p>";
            }
            return;
        }

        // Jedes Gericht bekommt eine eigene Preiswahl plus eigenen Bestellbutton.
        data.forEach(function (gericht, index) {
            // Parses the date string (e.g., "2026-06-16") as local date in Berlin timezone
            // by appending T00:00:00 to prevent UTC conversion
            const datumObj = new Date(gericht.Ausgabedatum + "T00:00:00");

            const dayIndex = datumObj.getDay();
            const tagName = WOCHENTAGE[dayIndex];
            const datumString = formatiereAnzeigeDatum(datumObj);
            const datumText = `${tagName}, ${datumString}`;

            const dish = {
                name: gericht.Gerichtname || "Unbenanntes Gericht",
                priceStud: toEuroText(gericht.PreisStudierende),
                priceBed: toEuroText(gericht.PreisBedienstet),
                priceGuest: toEuroText(gericht.PreisGast),
                image: gericht.image_url || "img/Profil.svg",
                allergene: gericht.Allergene || "keine Angabe",
                ernaehrungstyp: gericht.ernaehrungstyp || gericht.Ernaehrungstyp || gericht["Ernährungstyp"] || gericht.ernaehrung || null,
                datumText,
                isoDate: toIsoDate(datumObj)
            };

            const entry = document.createElement("div");
            entry.className = "speiseplan-eintrag";
            entry.innerHTML = `
                <div class="speiseplan-links">
                    <h3>${tagName}</h3>
                    <p>${datumString}</p>
                </div>

                <div class="speiseplan-mitte">
                    <img src="${dish.image}" class="gericht-bild" alt="${dish.name}">
                    <p>Tagesangebot</p>
                    <h3>${dish.name}</h3>

                    <p class="allergene">Allergene: ${dish.allergene}</p>
                    ${renderErnaehrungsBadge(dish.ernaehrungstyp)}
                    <div class="preise">
                        <div class="preis-zeile" data-key="stud">
                            <span class="preis-text">Studierende: <strong>${dish.priceStud}</strong></span>
                            <div class="kategorie-stepper" data-key="stud">
                                <button type="button" class="mengen-btn mengen-minus" data-key="stud">-</button>
                                <span class="mengen-anzahl" data-key="stud">0</span>
                                <button type="button" class="mengen-btn mengen-plus" data-key="stud">+</button>
                            </div>
                        </div>
                        <div class="preis-zeile" data-key="bed">
                            <span class="preis-text">Bedienstete: <strong>${dish.priceBed}</strong></span>
                            <div class="kategorie-stepper" data-key="bed">
                                <button type="button" class="mengen-btn mengen-minus" data-key="bed">-</button>
                                <span class="mengen-anzahl" data-key="bed">0</span>
                                <button type="button" class="mengen-btn mengen-plus" data-key="bed">+</button>
                            </div>
                        </div>
                        <div class="preis-zeile" data-key="guest">
                            <span class="preis-text">Gäste: <strong>${dish.priceGuest}</strong></span>
                            <div class="kategorie-stepper" data-key="guest">
                                <button type="button" class="mengen-btn mengen-minus" data-key="guest">-</button>
                                <span class="mengen-anzahl" data-key="guest">0</span>
                                <button type="button" class="mengen-btn mengen-plus" data-key="guest">+</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="speiseplan-rechts">
                    <p class="mengen-hinweis">Maximal ${MAX_GERICHTE_PRO_TAG} Gerichte pro Tag</p>
                </div>
            `;

            const quantityElements = {
                stud: entry.querySelector('.mengen-anzahl[data-key="stud"]'),
                bed: entry.querySelector('.mengen-anzahl[data-key="bed"]'),
                guest: entry.querySelector('.mengen-anzahl[data-key="guest"]')
            };

            const minusButtons = {
                stud: entry.querySelector('.mengen-minus[data-key="stud"]'),
                bed: entry.querySelector('.mengen-minus[data-key="bed"]'),
                guest: entry.querySelector('.mengen-minus[data-key="guest"]')
            };

            const plusButtons = {
                stud: entry.querySelector('.mengen-plus[data-key="stud"]'),
                bed: entry.querySelector('.mengen-plus[data-key="bed"]'),
                guest: entry.querySelector('.mengen-plus[data-key="guest"]')
            };

            function updateDishStepperUi() {
                const bestehendeAnzahl = bestehendeBestellungenProTag[dish.isoDate] || 0;
                const anzahlImWarenkorb = orderItems.filter(function (item) {
                    return item.bestellIsoDate === dish.isoDate;
                }).length;
                const hatTagKapazitaet = bestehendeAnzahl + anzahlImWarenkorb < MAX_GERICHTE_PRO_TAG;

                ["stud", "bed", "guest"].forEach(function (priceKey) {
                    const selectedPrice = {
                        stud: dish.priceStud,
                        bed: dish.priceBed,
                        guest: dish.priceGuest
                    }[priceKey];

                    const count = countOrderItemsForSelection(dish, priceKey);
                    const quantityElement = quantityElements[priceKey];
                    const plusButton = plusButtons[priceKey];
                    const minusButton = minusButtons[priceKey];

                    if (quantityElement) {
                        quantityElement.textContent = String(count);
                    }

                    const preisVerfuegbar = Boolean(selectedPrice && selectedPrice !== "-");
                    if (plusButton) {
                        plusButton.disabled = !preisVerfuegbar || !hatTagKapazitaet;
                    }
                    if (minusButton) {
                        minusButton.disabled = count === 0;
                    }
                });
            }

            Object.keys(plusButtons).forEach(function (priceKey) {
                const plusButton = plusButtons[priceKey];
                if (!plusButton) {
                    return;
                }
                plusButton.addEventListener("click", function () {
                    addOrderItem(dish, priceKey);
                });
            });

            Object.keys(minusButtons).forEach(function (priceKey) {
                const minusButton = minusButtons[priceKey];
                if (!minusButton) {
                    return;
                }
                minusButton.addEventListener("click", function () {
                    removeOrderItem(dish, priceKey);
                });
            });

            orderUiSyncCallbacks.push(updateDishStepperUi);
            updateDishStepperUi();

            container.appendChild(entry);
        });
    }

    // Speichern der Daten in der Supabase-Tabelle "Bestellungen".
    async function speichereBestellungen(orderItems, nutzerEmail) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;

        if (sessionError || !user) {
            throw new Error("Kein eingeloggter Nutzer gefunden.");
        }

        const rows = orderItems.map(item => ({
            auth_user_id: user.id,
            email: nutzerEmail || user.email || "",
            gericht_name: item.name,
            bestell_datum: item.bestellIsoDate,
            kategorie: item.category,
            preis: item.price,
            image_url: item.image || "",
            status: "bestellt"
        }));

        const anzahlNeuProTag = zaehleEintraegeProTag(orderItems);
        const limitUeberschritten = Object.keys(anzahlNeuProTag).find(function (isoDate) {
            const bereits = bestehendeBestellungenProTag[isoDate] || 0;
            const neu = anzahlNeuProTag[isoDate] || 0;
            return bereits + neu > MAX_GERICHTE_PRO_TAG;
        });

        if (limitUeberschritten) {
            throw new Error(`Maximal ${MAX_GERICHTE_PRO_TAG} Gerichte pro Tag erlaubt.`);
        }

        const { error } = await supabase
            .from("Bestellungen")
            .insert(rows);

        if (error) {
            throw new Error(error.message);
        }
    }
    async function sendeBestellbestaetigung(user, orderItems, nutzerEmail) {
        const empfaengerEmail = String(nutzerEmail || user?.email || "").trim();
        if (!empfaengerEmail) {
            throw new Error("Keine gültige Empfänger-E-Mail gefunden.");
        }

        const orderSummary = orderItems
            .map(item => `1x ${item.name} | ${item.date} | ${item.category} | ${item.price}`)
            .join("\n");

        const totalPrice = orderItems
            .reduce((sum, item) => sum + parsePrice(item.price), 0);

        const { data, error } = await supabase.functions.invoke("send-order-email", {
            body: {
                to_email: empfaengerEmail,
                name: user.user_metadata?.full_name || userContext.displayName || empfaengerEmail,
                gericht: orderSummary,
                preis: formatPrice(totalPrice),
                datum: orderItems[0]?.date || "-"
            }
        });

        if (error) {
            throw new Error(`Bestätigungsmail konnte nicht gesendet werden. ${error.message}`);
        }

        if (data?.success !== true) {
            throw new Error("Bestätigungsmail konnte nicht gesendet werden.");
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function zeigeBestellPopup(gespeicherteBestellungen, mailHinweis) {
        const overlay = document.getElementById("bestell-confirm-overlay");
        const listElement = document.getElementById("bestell-confirm-list");
        const totalElement = document.getElementById("bestell-confirm-total");
        const subtitleElement = document.getElementById("bestell-confirm-subtitle");

        if (!overlay || !listElement || !totalElement || !subtitleElement) {
            return;
        }

        listElement.innerHTML = gespeicherteBestellungen
            .map(function (item) {
                return `<div class="bestell-confirm-item">
                    <div>
                        <strong>1x ${escapeHtml(item.name)}</strong>
                        <span>${escapeHtml(item.date)} | ${escapeHtml(item.category)}</span>
                    </div>
                    <strong>${escapeHtml(item.price)}</strong>
                </div>`;
            })
            .join("");

        const total = gespeicherteBestellungen.reduce(function (sum, item) {
            return sum + parsePrice(item.price);
        }, 0);

        totalElement.textContent = formatPrice(total);
        subtitleElement.textContent = mailHinweis || "Ihre Bestellung wurde erfolgreich übermittelt.";

        overlay.classList.add("is-visible");
        overlay.setAttribute("aria-hidden", "false");
    }

    function schliesseBestellPopup() {
        const overlay = document.getElementById("bestell-confirm-overlay");
        if (!overlay) {
            return;
        }

        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
    }

    const popupCloseButton = document.getElementById("bestell-confirm-close");
    if (popupCloseButton) {
        popupCloseButton.addEventListener("click", schliesseBestellPopup);
    }

    const popupOverlay = document.getElementById("bestell-confirm-overlay");
    if (popupOverlay) {
        popupOverlay.addEventListener("click", function (event) {
            if (event.target === popupOverlay) {
                schliesseBestellPopup();
            }
        });
    }

    // Beim Abschicken: in der DB speichern und danach Popup anzeigen.
    const abschickenButton = document.querySelector(".vorbestellung-button");
    if (abschickenButton) {
        abschickenButton.addEventListener("click", async function (e) {
            e.preventDefault();

            if (orderItems.length === 0) {
                alert("Bitte füge zuerst ein Gericht zur Bestellung hinzu.");
                return;
            }

            try {
                const nutzerEmail = userContext.email;
                const gespeicherteBestellungen = orderItems.map(item => ({ ...item }));
                await speichereBestellungen(orderItems, nutzerEmail);

                let mailHinweis = "Ihre Bestellung wurde erfolgreich übermittelt.";
                try {
                    await sendeBestellbestaetigung(user, orderItems, nutzerEmail);
                } catch (mailError) {
                    mailHinweis = "Ihre Bestellung wurde gespeichert. Die Bestätigungsmail konnte leider nicht gesendet werden.";
                }

                // Nach erfolgreichem Speichern Warenkorb leeren und Status aktualisieren.
                orderItems = [];
                updateOrderSummary();
                bestehendeBestellungenProTag = await ladeAlleBestehendenBestellungenProTag(user.id);
                await aktualisiereBestellstatusHeader(user.id);

                zeigeBestellPopup(gespeicherteBestellungen, mailHinweis);
            } catch (error) {
                alert("Bestellungen konnten nicht gespeichert werden: " + error.message);
            }
        });
    }

    updateOrderSummary();
    try {
        bestehendeBestellungenProTag = await ladeAlleBestehendenBestellungenProTag(user.id);
    } catch (error) {
        console.warn("Bestehende Bestellungen pro Tag konnten nicht geladen werden:", error);
        bestehendeBestellungenProTag = {};
    }
    ladeGerichtzeitraum();
    await ladeGerichteDerUebernaechstenWoche();
});
