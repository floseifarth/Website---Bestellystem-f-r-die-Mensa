document.addEventListener("DOMContentLoaded", function () {
    const inputs = Array.from(document.querySelectorAll(".pin-input"));

    inputs.forEach((input, index) => {
        // Nur Ziffern erlauben
        input.addEventListener("keydown", function (e) {
            if (e.key === "Backspace") {
                input.value = "";
                if (index > 0) inputs[index - 1].focus();
                e.preventDefault();
            } else if (!/^[0-9]$/.test(e.key) && !["Tab", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
            }
        });

        input.addEventListener("input", function () {
            if (input.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        // Einfügen (Paste) eines 6-stelligen Codes
        input.addEventListener("paste", function (e) {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
            pasted.split("").slice(0, inputs.length).forEach((char, i) => {
                if (inputs[i]) inputs[i].value = char;
            });
            const lastFilled = Math.min(pasted.length, inputs.length - 1);
            inputs[lastFilled].focus();
        });
    });
});
