import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function extractMatrikelnummer(lines: string[], fullText: string): string {
    // 1. Suche direkt nach typischen Labels auf der gleichen Zeile oder Folgezeile.
    const labelPattern =
        /(matrikel(?:nummer|nr\.?)?|matr\.?\s*-?\s*nr\.?|student(?:en)?\s*(?:nummer|id|nr)|enrolment\s*no\.?)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (labelPattern.test(line)) {
            // Zahl in der gleichen Zeile nach dem Label?
            const sameLineMatch = line
                .replace(labelPattern, "")
                .replace(/[:\-\s]/g, "")
                .match(/^\d{4,12}$/);
            if (sameLineMatch) {
                return sameLineMatch[0];
            }

            // Zahl in der naechsten Zeile?
            const nextLine = normalizeWhitespace(lines[i + 1] ?? "");
            const nextMatch = nextLine.replace(/\s/g, "").match(/^\d{4,12}$/);
            if (nextMatch) {
                return nextMatch[0];
            }

            // Zahl irgendwo nach Label in derselben Zeile (auch mit Trennzeichen)?
            const inlineMatch = line.match(
                /(?:matrikel|matr|student|enrolment)[^0-9]*(\d{4,12})/i
            );
            if (inlineMatch) {
                return inlineMatch[1];
            }
        }
    }

    // 2. Fallback: Isolierte Zahlenfolge (5-12 Ziffern), laengste nehmen.
    const allNumbers = Array.from(
        fullText.replace(/\s/g, "").matchAll(/\b\d{5,12}\b/g)
    ).map((m) => m[0]);

    if (allNumbers.length > 0) {
        allNumbers.sort((a, b) => b.length - a.length);
        return allNumbers[0];
    }

    return "";
}

function extractName(
    lines: string[]
): { vorname: string; nachname: string } {
    const skipPattern =
        /(hochschule|university|esslingen|applied|sciences|studierendenausweis|studentenausweis|campus|valid|gueltig|semester|karte|card|ausweis|bibliothek|library|matrikel|matr|student\s*id|enrolment|geboren|geburts|geboren|email|tel\.|immatrikul|faculty|fachbereich|studiengang|programme)/i;

    const nameOnlyWord = /^[A-Za-zÄÖÜäöüßÀ-ÿ'\-]{2,}$/;

    for (const line of lines) {
        if (skipPattern.test(line)) continue;
        if (/\d/.test(line)) continue;

        // Format: "NACHNAME, VORNAME" oder "Nachname, Vorname"
        const commaMatch = line.match(
            /^([A-Za-zÄÖÜäöüßÀ-ÿ'\-]+(?:\s[A-Za-zÄÖÜäöüßÀ-ÿ'\-]+)*)\s*,\s*([A-Za-zÄÖÜäöüßÀ-ÿ'\-]+(?:\s[A-Za-zÄÖÜäöüßÀ-ÿ'\-]+)*)$/
        );
        if (commaMatch) {
            return { nachname: commaMatch[1].trim(), vorname: commaMatch[2].trim() };
        }

        // Format: "VORNAME NACHNAME" (2-4 reine Namenswörter)
        const parts = line.split(/\s+/).filter((w) => nameOnlyWord.test(w));
        if (parts.length >= 2 && parts.length <= 4 && parts.length === line.split(/\s+/).length) {
            return {
                vorname: parts.slice(0, parts.length - 1).join(" "),
                nachname: parts[parts.length - 1],
            };
        }
    }

    return { vorname: "", nachname: "" };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return jsonResponse({ error: "Methode nicht erlaubt" }, 405);
    }

    try {
        if (!GOOGLE_VISION_API_KEY) {
            return jsonResponse({ error: "GOOGLE_VISION_API_KEY fehlt" }, 500);
        }

        let imageBase64 = "";

        try {
            const payload = await req.json();
            imageBase64 = String(payload?.imageBase64 ?? "").trim();
        } catch {
            return jsonResponse({ error: "Ungültiger JSON-Body" }, 400);
        }

        if (!imageBase64) {
            return jsonResponse({ error: "Kein Bild empfangen" }, 400);
        }

        const visionResponse = await fetch(
            "https://vision.googleapis.com/v1/images:annotate?key=" +
            GOOGLE_VISION_API_KEY,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: [
                        {
                            image: { content: imageBase64 },
                            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                        },
                    ],
                }),
            }
        );

        const visionData = await visionResponse.json();

        if (!visionResponse.ok) {
            return jsonResponse(
                {
                    error: "Google Vision API Fehler",
                    status: visionResponse.status,
                    details: visionData,
                },
                502
            );
        }

        const fullText: string =
            visionData?.responses?.[0]?.fullTextAnnotation?.text ??
            visionData?.responses?.[0]?.textAnnotations?.[0]?.description ??
            "";

        const lines: string[] = fullText
            .split("\n")
            .map((line: string) => normalizeWhitespace(line))
            .filter(Boolean);

        const matrikelnummer = extractMatrikelnummer(lines, fullText);
        const { vorname, nachname } = extractName(lines);

        const success = Boolean(vorname || nachname || matrikelnummer);

        return jsonResponse({
            success,
            text: fullText,
            lines,
            vorname,
            nachname,
            matrikelnummer,
        });
    } catch (error) {
        return jsonResponse(
            { error: "Unerwarteter Fehler", details: String(error) },
            500
        );
    }
});
