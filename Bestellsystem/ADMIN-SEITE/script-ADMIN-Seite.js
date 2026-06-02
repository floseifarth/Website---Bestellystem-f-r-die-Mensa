const scanButton = document.getElementById("scan-qr-btn");
const scanStatus = document.getElementById("scan-status");
const zoneCEmpty = document.getElementById("zone-c-empty");
const zoneCResult = document.getElementById("zone-c-result");
const zoneCStatus = document.getElementById("zone-c-status");
const zoneCToggleAdjust = document.getElementById("zone-c-toggle-adjust");
const zoneCAdjustBox = document.getElementById("zone-c-adjust-box");
const zoneCCancelBtn = document.getElementById("zone-c-cancel-btn");
const zoneCMainBtn = document.getElementById("zone-c-main-btn");
const zoneCOpenFreeBtn = document.getElementById("zone-c-open-free-btn");
const zoneCFreeBox = document.getElementById("zone-c-free-box");
const zoneCFreeCancelBtn = document.getElementById("zone-c-free-cancel-btn");
const zoneCFreeSaveBtn = document.getElementById("zone-c-free-save-btn");
const zoneCFreeFeedback = document.getElementById("zone-c-free-feedback");
const zoneCFreeCountStud = document.getElementById("zone-c-free-count-stud");
const zoneCFreeCountBed = document.getElementById("zone-c-free-count-bed");
const zoneCFreeCountGast = document.getElementById("zone-c-free-count-gast");
const freeSteppers = document.querySelectorAll("#zone-c-free-box .zone-c-stepper");
const zoneCAdjustCountStud = document.getElementById("zone-c-adjust-count-stud");
const zoneCAdjustCountBed = document.getElementById("zone-c-adjust-count-bed");
const zoneCAdjustCountGast = document.getElementById("zone-c-adjust-count-gast");
const adjustSteppers = document.querySelectorAll("#zone-c-adjust-box .zone-c-stepper");

function getCount(counterElement) {
    if (!counterElement) {
        return 0;
    }
    const parsed = Number.parseInt(counterElement.textContent || "0", 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function setCount(counterElement, nextValue) {
    if (!counterElement) {
        return;
    }
    counterElement.textContent = String(Math.max(0, nextValue));
}

function resetFreeCounts() {
    setCount(zoneCFreeCountStud, 0);
    setCount(zoneCFreeCountBed, 0);
    setCount(zoneCFreeCountGast, 0);
}

function getAdjustTotal() {
    return getCount(zoneCAdjustCountStud) + getCount(zoneCAdjustCountBed) + getCount(zoneCAdjustCountGast);
}

function updateMainPickupButton() {
    if (!zoneCMainBtn) {
        return;
    }
    const total = getAdjustTotal();
    zoneCMainBtn.textContent = String(total) + " Bestellungen abgeholt";
    zoneCMainBtn.disabled = total === 0;
}

freeSteppers.forEach(function (stepper) {
    const targetId = stepper.getAttribute("data-target");
    if (!targetId) {
        return;
    }

    const counter = document.getElementById(targetId);
    const plusBtn = stepper.querySelector(".zone-c-stepper-plus");
    const minusBtn = stepper.querySelector(".zone-c-stepper-minus");

    if (plusBtn && counter) {
        plusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) + 1);
        });
    }

    if (minusBtn && counter) {
        minusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) - 1);
        });
    }
});

adjustSteppers.forEach(function (stepper) {
    const targetId = stepper.getAttribute("data-target");
    if (!targetId) {
        return;
    }

    const counter = document.getElementById(targetId);
    const plusBtn = stepper.querySelector(".zone-c-stepper-plus");
    const minusBtn = stepper.querySelector(".zone-c-stepper-minus");

    if (plusBtn && counter) {
        plusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) + 1);
            updateMainPickupButton();
        });
    }

    if (minusBtn && counter) {
        minusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) - 1);
            updateMainPickupButton();
        });
    }
});

updateMainPickupButton();

function showZoneCResult() {
    if (zoneCEmpty) {
        zoneCEmpty.classList.add("is-hidden");
    }
    if (zoneCFreeBox) {
        zoneCFreeBox.classList.add("is-hidden");
    }
    if (zoneCResult) {
        zoneCResult.classList.remove("is-hidden");
    }
}

if (scanButton) {
    scanButton.addEventListener("click", function () {
        if (scanStatus) {
            scanStatus.textContent = "Scanner wird gestartet...";
        }

        showZoneCResult();
        if (zoneCStatus) {
            zoneCStatus.textContent = "Bestellung gefunden";
        }
        updateMainPickupButton();

        // Frontend-only trigger: backend/mobile scanner can hook into this event.
        document.dispatchEvent(new CustomEvent("admin:scan-requested"));
    });
}

if (zoneCToggleAdjust && zoneCAdjustBox) {
    zoneCToggleAdjust.addEventListener("click", function () {
        zoneCAdjustBox.classList.toggle("is-hidden");
    });
}

if (zoneCCancelBtn && zoneCAdjustBox) {
    zoneCCancelBtn.addEventListener("click", function () {
        zoneCAdjustBox.classList.add("is-hidden");
    });
}

if (zoneCMainBtn && zoneCStatus) {
    zoneCMainBtn.addEventListener("click", function () {
        const total = getAdjustTotal();
        zoneCStatus.textContent = String(total) + " Bestellungen als abgeholt markiert";
    });
}

if (zoneCOpenFreeBtn && zoneCFreeBox && zoneCResult) {
    zoneCOpenFreeBtn.addEventListener("click", function () {
        zoneCResult.classList.add("is-hidden");
        zoneCFreeBox.classList.remove("is-hidden");
    });
}

if (zoneCFreeCancelBtn && zoneCFreeBox) {
    zoneCFreeCancelBtn.addEventListener("click", function () {
        zoneCFreeBox.classList.add("is-hidden");
        resetFreeCounts();
    });
}

if (zoneCFreeSaveBtn && zoneCStatus) {
    zoneCFreeSaveBtn.addEventListener("click", function () {
        const stud = getCount(zoneCFreeCountStud);
        const bed = getCount(zoneCFreeCountBed);
        const gast = getCount(zoneCFreeCountGast);
        const gesamt = stud + bed + gast;

        if (gesamt === 0) {
            if (zoneCFreeFeedback) {
                zoneCFreeFeedback.textContent = "Bitte mindestens 1 freies Essen auswaehlen.";
                zoneCFreeFeedback.classList.remove("is-hidden");
            }
            return;
        }

        if (zoneCFreeBox) {
            zoneCFreeBox.classList.add("is-hidden");
        }
        if (zoneCFreeFeedback) {
            zoneCFreeFeedback.textContent = "Freies Essen verbucht - Studierende: " + stud + ", Bedienstete: " + bed + ", Gäste: " + gast + " (Gesamt: " + gesamt + ")";
            zoneCFreeFeedback.classList.remove("is-hidden");
        }
        resetFreeCounts();
    });
}
