import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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
        .select("Vorname")
        .ilike("email", email)
        .maybeSingle();

    if (!error && data?.Vorname) {
        return data.Vorname;
    }

    return email;
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
        window.location.href = "Anmeldestartseite.html";
        return;
    }

    const displayName = await ermittleVorname(user);
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    let orderItems = [];

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
        const startDate = ermittleStartDerUebernaechstenWoche();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 4);

        const anzeigeElement = document.getElementById("GerichtanzeigeDatum");
        if (anzeigeElement) {
            const startString = formatiereAnzeigeDatum(startDate);
            const endString = formatiereAnzeigeDatum(endDate);
            anzeigeElement.innerText = `Gerichte für den Zeitraum: ${startString} - ${endString}`;
        }
    }

    async function ladeGerichteDerUebernaechstenWoche() {
        const startDate = ermittleStartDerUebernaechstenWoche();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 4);

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
            container.innerHTML = "<p>Für die übernächste Woche (Mo-Fr) sind aktuell keine Gerichte eingetragen.</p>";
            return;
        }

        // Jedes Gericht bekommt eine eigene Preiswahl plus eigenen Bestellbutton.
        data.forEach(function (gericht, index) {
            const datumObj = new Date(gericht.Ausgabedatum);
            datumObj.setMinutes(datumObj.getMinutes() + datumObj.getTimezoneOffset());

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
    async function speichereBestellungen(orderItems) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;

        if (sessionError || !user) {
            throw new Error("Kein eingeloggter Nutzer gefunden.");
        }

        const rows = orderItems.map(item => ({
            auth_user_id: user.id,
            email: user.email || "",
            gericht_name: item.name,
            bestell_datum: item.bestellIsoDate,
            kategorie: item.category,
            preis: item.price,
            image_url: item.image || ""
        }));

        const { error } = await supabase
            .from("Bestellungen")
            .insert(rows);

        if (error) {
            throw new Error(error.message);
        }
    }
async function sendeBestellbestaetigung(user, orderItems) {
    const orderSummary = orderItems
        .map(item => `1x ${item.name}`)
        .join("\n");

    const totalPrice = orderItems
        .reduce((sum, item) => sum + parsePrice(item.price), 0);

    await emailjs.send(
        "service_46zmvnc",
        "template_ugos18i",
        {
            to_email: user.email,
            email: user.email,

            name: user.user_metadata?.full_name || user.email,

            from_name: "MensaGo No-Reply",
            reply_to: "mensagohs-esslingen@outlook.de",

            gericht: orderSummary,
            preis: formatPrice(totalPrice),
            datum: orderItems[0]?.date || "-"
        }
    );
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
                await speichereBestellungen(orderItems);
                await sendeBestellbestaetigung(user, orderItems);
                 window.location.href = "Bestätigungsseite.html";
            } catch (error) {
                alert("Bestellungen konnten nicht gespeichert werden: " + error.message);
            }
        });
    }

    updateOrderSummary();
    ladeGerichtzeitraum();
    await ladeGerichteDerUebernaechstenWoche();
});
