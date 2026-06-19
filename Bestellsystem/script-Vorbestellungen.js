import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MAX_GERICHTE_PRO_TAG = 3;
const TEST_BESTELLUNG_HEUTE_AKTIV = true;
const EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send";
const EMAILJS_SERVICE_ID = "service_46zmvnc";
const EMAILJS_TEMPLATE_ID = "template_ugos18i";
const EMAILJS_PUBLIC_KEY = "83oOfEchy894C2Az9";

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
        .select("*")
        .ilike("email", email)
        .maybeSingle();

    const vorname = data?.vorname || data?.Vorname;
    if (!error && vorname) {
        return vorname;
    }

    return email.split("@")[0];
}

async function ermittleNutzerEmail(user) {
    const authEmail = String(user?.email || "").trim();
    const userId = String(user?.id || "").trim();

    if (userId) {
        const { data, error } = await supabase
            .from("students")
            .select("email")
            .eq("user_id", userId)
            .maybeSingle();

        const studentenEmail = String(data?.email || "").trim();
        if (!error && studentenEmail) {
            return studentenEmail;
        }
    }

    return authEmail;
}

document.addEventListener("DOMContentLoaded", async function () {
    const heute = new Date();
    const wochentag = WOCHENTAGE[heute.getDay()];
    const datum = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentag + ", " + datum;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const displayName = await ermittleVorname(user);
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;

    }
    aktualisiereBestellstatusHeader(user.id);
    let orderItems = [];
    let bestehendeBestellungenProTag = {};

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
    }

    function addOrderItem(dish, selectedPriceKey) {
        // Preis und Kategorie werden ueber den gewaelten Radio-Key aufgeloest.
        const priceMap = {
            stud: dish.priceStud,
            bed: dish.priceBed,
            guest: dish.priceGuest
        };

        const categoryMap = {
            stud: "Studierende",
            bed: "Bedienstete",
            guest: "Gäste"
        };

        const selectedPrice = priceMap[selectedPriceKey];
        const selectedCategory = categoryMap[selectedPriceKey];

        if (!selectedPrice || selectedPrice === "-") {
            alert("Für diese Kategorie ist aktuell kein Preis hinterlegt.");
            return;
        }

        const bestehendeAnzahl = bestehendeBestellungenProTag[dish.isoDate] || 0;
        const anzahlImWarenkorb = orderItems.filter(function (item) {
            return item.bestellIsoDate === dish.isoDate;
        }).length;

        if (bestehendeAnzahl + anzahlImWarenkorb >= MAX_GERICHTE_PRO_TAG) {
            alert(`Maximal ${MAX_GERICHTE_PRO_TAG} Gerichte pro Tag erlaubt.`);
            return;
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
            .select("Gerichtname, Allergene, PreisStudierende, PreisBedienstet, PreisGast, image_url, Ausgabedatum")
            .gte("Ausgabedatum", startIsoDate)
            .lte("Ausgabedatum", endIsoDate)
            .order("Ausgabedatum", { ascending: true });

        const container = document.getElementById("speiseplan-container");
        if (!container) return;

        container.innerHTML = "";

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
                datumText,
                isoDate: toIsoDate(datumObj)
            };

            const radioName = `preis-${index}`;
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
                    <div class="preise">
                        <label><input type="radio" name="${radioName}" value="stud"> Studierende: <strong>${dish.priceStud}</strong></label><br>
                        <label><input type="radio" name="${radioName}" value="bed"> Bedienstete: <strong>${dish.priceBed}</strong></label><br>
                        <label><input type="radio" name="${radioName}" value="guest"> Gäste: <strong>${dish.priceGuest}</strong></label>
                    </div>
                </div>

                <div class="speiseplan-rechts">
                    <button type="button" class="vorbestell-btn" disabled>Zur Bestellung hinzufügen</button>
                </div>
            `;

            const addButton = entry.querySelector(".vorbestell-btn");
            const priceRadios = entry.querySelectorAll(`input[name="${radioName}"]`);

            priceRadios.forEach(function (radio) {
                radio.addEventListener("change", function () {
                    // Der Button wird erst nach gueltiger Preiswahl freigeschaltet.
                    if (addButton) addButton.disabled = false;
                });
            });

            if (addButton) {
                addButton.addEventListener("click", function () {
                    const selectedRadio = entry.querySelector(`input[name="${radioName}"]:checked`);
                    if (!selectedRadio) {
                        alert("Bitte zuerst eine Preiskategorie auswählen.");
                        return;
                    }

                    addOrderItem(dish, selectedRadio.value);
                    selectedRadio.checked = false;
                    addButton.disabled = true;
                });
            }

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

        const body = {
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: empfaengerEmail,
                name: user.user_metadata?.full_name || empfaengerEmail,
                gericht: orderSummary,
                preis: formatPrice(totalPrice),
                datum: orderItems[0]?.date || "-"
            }
        };

        const response = await fetch(EMAILJS_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Bestätigungsmail konnte nicht gesendet werden. ${text}`);
        }
    }
    // Beim Abschicken: in der DB speichern und erst dann weiterleiten.
    const abschickenButton = document.querySelector(".vorbestellung-button");
    if (abschickenButton) {
        abschickenButton.addEventListener("click", async function (e) {
            e.preventDefault();

            if (orderItems.length === 0) {
                alert("Bitte füge zuerst ein Gericht zur Bestellung hinzu.");
                return;
            }

            try {
                const nutzerEmail = await ermittleNutzerEmail(user);
                await speichereBestellungen(orderItems, nutzerEmail);
                try {
                    await sendeBestellbestaetigung(user, orderItems, nutzerEmail);
                } catch (mailError) {
                    alert("Bestellung gespeichert, aber Bestätigungsmail konnte nicht gesendet werden. " + (mailError?.message || ""));
                    window.location.href = "Bestätigungsseite.html";
                    return;
                }
                window.location.href = "Bestätigungsseite.html";
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
