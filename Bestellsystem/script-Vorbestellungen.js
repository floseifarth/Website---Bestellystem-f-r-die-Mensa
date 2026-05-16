import { supabase } from "./supabaseClient.js";
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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


    const wochentag = WOCHENTAGE[heute.getDay()];
    const datum = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentag + ", " + datum;
    }

    // Array für die aktuelle Bestellliste
    let orderItems = [];
    let currentDish = null;

    function getDishUiElements() {
        return {
            nameElement: document.getElementById("gericht-name"),
            dishImage: document.querySelector(".gericht-bild"),
            tagElement: document.getElementById("gericht-tag"),
            gerichtDatumElement: document.getElementById("gericht-datum"),
            studElement: document.getElementById("preis-stud"),
            bedElement: document.getElementById("preis-bed"),
            guestElement: document.getElementById("preis-guest"),
            allergeneElement: document.querySelector(".allergene")
        };
    }

    function setDishDateText(gerichtDatumElement, datumText) {
        if (!gerichtDatumElement || !datumText) return;
        const parts = datumText.split(", ");
        gerichtDatumElement.innerText = parts[1] || datumText;
    }

    function resetPriceSelection() {
        document.querySelectorAll('input[name="preis"]').forEach(radio => {
            radio.checked = false;
        });

        const addBtn = document.getElementById("add-order-button");
        if (addBtn) addBtn.disabled = true;
    }

    // Den Textpreis wie "4,10 €" in eine Zahl wandeln
    function parsePrice(priceText) {
        const cleaned = priceText.replace(/[^\d,.-]/g, "");
        return Number(cleaned.replace(",", "."));
    }

    // Numerischen Preis in deutsches Format umwandeln
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

    function renderDish(dish, weekday, datumText) {
        const {
            nameElement,
            dishImage,
            tagElement,
            gerichtDatumElement,
            studElement,
            bedElement,
            guestElement,
            allergeneElement
        } = getDishUiElements();

        if (nameElement) nameElement.innerText = dish.name;
        if (studElement) studElement.innerText = dish.priceStud;
        if (bedElement) bedElement.innerText = dish.priceBed;
        if (guestElement) guestElement.innerText = dish.priceGuest;
        if (dishImage) {
            if (dish.image) {
                dishImage.src = dish.image;
                dishImage.alt = dish.alt;
            } else {
                dishImage.removeAttribute("src");
                dishImage.alt = "";
            }
        }
        if (tagElement) tagElement.innerText = weekday;
        setDishDateText(gerichtDatumElement, datumText);
        if (allergeneElement) {
            allergeneElement.innerText = `Allergene: ${dish.allergene || "keine Angabe"}`;
        }

        resetPriceSelection();
    }

    function clearDish(weekday, datumText) {
        const {
            nameElement,
            dishImage,
            tagElement,
            gerichtDatumElement,
            studElement,
            bedElement,
            guestElement,
            allergeneElement
        } = getDishUiElements();

        if (nameElement) nameElement.innerText = "";
        if (studElement) studElement.innerText = "";
        if (bedElement) bedElement.innerText = "";
        if (guestElement) guestElement.innerText = "";
        if (dishImage) {
            dishImage.removeAttribute("src");
            dishImage.alt = "";
        }
        if (tagElement) tagElement.innerText = weekday;
        setDishDateText(gerichtDatumElement, datumText);
        if (allergeneElement) {
            allergeneElement.innerText = "";
        }

        resetPriceSelection();
    }

    // Lädt genau ein Gericht für das gewählte Ausgabedatum.
    async function ladeGerichtFuerDatum(isoDate, weekday, datumText) {
        const nextDate = new Date(`${isoDate}T00:00:00`);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextYear = nextDate.getFullYear();
        const nextMonth = String(nextDate.getMonth() + 1).padStart(2, "0");
        const nextDay = String(nextDate.getDate()).padStart(2, "0");
        const nextIsoDate = `${nextYear}-${nextMonth}-${nextDay}`;

        const { data, error } = await supabase
            .from("Speiseplan")
            .select("Gerichtname, Allergene, PreisStudierende, PreisBedienstete, PreisGast, image_url")
            .gte("Ausgabedatum", isoDate)
            .lt("Ausgabedatum", nextIsoDate)
            .order("Ausgabedatum", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Fehler beim Laden der Vorbestellungs-Gerichte:", error);
        }

        if (data) {
            currentDish = {
                name: data.Gerichtname || "Unbenanntes Gericht",
                priceStud: toEuroText(data.PreisStudierende),
                priceBed: toEuroText(data.PreisBedienstete),
                priceGuest: toEuroText(data.PreisGast),
                image: data.image_url || "",
                alt: data.Gerichtname || "Gericht",
                allergene: data.Allergene || "keine Angabe"
            };
            renderDish(currentDish, weekday, datumText);
        } else {
            currentDish = null;
            clearDish(weekday, datumText);
        }
    }

    // Bestellübersicht rechts neu zeichnen
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
                                 <button class="remove-button">x</button>
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

    // Aktuelles Gericht zur Bestellliste hinzufügen
    function addOrderItem() {
        const nameElement = document.getElementById("gericht-name");
        const datumSelect = document.getElementById("datum-select");
        const itemElement = document.querySelector(".gericht-bild");
        const selectedRadio = document.querySelector('input[name="preis"]:checked');
        if (!nameElement || !datumSelect || !selectedRadio || !currentDish) return;

        const priceMap = { stud: currentDish.priceStud, bed: currentDish.priceBed, guest: currentDish.priceGuest };
        const categoryMap = { stud: "Studierende", bed: "Bedienstete", guest: "Gäste" };
        const selectedPrice = priceMap[selectedRadio.value];
        const selectedCategory = categoryMap[selectedRadio.value];

        if (!selectedPrice || selectedPrice === "-") {
            alert("Für diese Kategorie ist aktuell kein Preis hinterlegt.");
            return;
        }

        const selectedDate = datumSelect.selectedOptions[0]?.textContent || datum;

        orderItems.push({
            date: selectedDate,
            name: nameElement.innerText,
            price: selectedPrice,
            category: selectedCategory,
            image: itemElement ? itemElement.src : ""
        });
        updateOrderSummary();

        localStorage.setItem("Bestellung", JSON.stringify(orderItems));
    }

    // Datumsauswahl mit den nächsten 14 Werktagen befüllen
    const datumSelect = document.getElementById("datum-select");
    if (datumSelect) {
        datumSelect.innerHTML = "";
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 14);

        let addedDays = 0;
        let currentDate = new Date(startDate);

        while (addedDays < 14) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const tagName = WOCHENTAGE[dayOfWeek];
                const datumString = currentDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
                const option = document.createElement("option");
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, "0");
                const day = String(currentDate.getDate()).padStart(2, "0");
                option.value = `${year}-${month}-${day}`;
                option.textContent = `${tagName}, ${datumString}`;
                option.dataset.weekday = tagName;
                datumSelect.appendChild(option);
                addedDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        datumSelect.addEventListener("change", async function () {
            const weekday = this.selectedOptions[0]?.dataset.weekday;
            const datumText = this.selectedOptions[0]?.textContent;
            const isoDate = this.selectedOptions[0]?.value;
            if (weekday && isoDate) {
                await ladeGerichtFuerDatum(isoDate, weekday, datumText);
            }
        });

        if (datumSelect.options.length > 0) {
            datumSelect.selectedIndex = 0;
            await ladeGerichtFuerDatum(
                datumSelect.options[0].value,
                datumSelect.options[0].dataset.weekday,
                datumSelect.options[0].textContent
            );
        }
    }

    // Button aktivieren sobald ein Preis gewählt wird
    document.querySelectorAll('input[name="preis"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            const addBtn = document.getElementById("add-order-button");
            if (addBtn) addBtn.disabled = false;
        });
    });

    // Klick-Event auf den Bestellbutton setzen
    const addButton = document.getElementById("add-order-button");
    if (addButton) {
        addButton.addEventListener("click", addOrderItem);
    }

    // Beim Abschicken: Bestellung im localStorage speichern
    const abschickenButton = document.querySelector(".vorbestellung-button");
    if (abschickenButton) {
        abschickenButton.addEventListener("click", function (e) {
            if (orderItems.length === 0) {
                e.preventDefault();
                alert("Bitte füge zuerst ein Gericht zur Bestellung hinzu.");
                return;
            }
            const vorhandene = JSON.parse(localStorage.getItem("bestellungen")) || [];
            const alleBestellungen = vorhandene.concat(orderItems);
            localStorage.setItem("bestellungen", JSON.stringify(alleBestellungen));
        });
    }

    // Zu Beginn die Bestellübersicht initial anzeigen
    updateOrderSummary();
});