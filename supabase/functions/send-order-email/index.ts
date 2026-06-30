import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Nicht autorisiert" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { to_email, name, gericht, preis, datum } = await req.json();

        if (!to_email || !gericht) {
            return new Response(
                JSON.stringify({ error: "to_email und gericht sind erforderlich" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const smtpUser = Deno.env.get("SMTP_USER") || "";
        const smtpPass = Deno.env.get("SMTP_PASS") || "";
        const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
        const senderName = Deno.env.get("SMTP_SENDER_NAME") || "MensaGo";

        const client = new SMTPClient({
            connection: {
                hostname: smtpHost,
                port: 465,
                tls: true,
                auth: {
                    username: smtpUser,
                    password: smtpPass,
                },
            },
        });

        await client.send({
            from: `${senderName} <${smtpUser}>`,
            to: to_email,
            subject: "MensaGo - Ihre Bestellung",
            content: `Hallo ${name || to_email},\n\nDeine Bestellung wurde erfolgreich aufgenommen:\n\n${gericht}\n\nGesamtpreis: ${preis || "-"}\nDatum: ${datum || "-"}\n\nGuten Appetit!\nDein MensaGo-Team`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px;">
          <h2 style="color: #18345d;">Bestellbestätigung</h2>
          <p>Hallo <strong>${name || to_email}</strong>,</p>
          <p>Deine Bestellung wurde erfolgreich aufgenommen:</p>
          <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px;">${gericht}</pre>
          <p><strong>Gesamtpreis:</strong> ${preis || "-"}</p>
          <p><strong>Datum:</strong> ${datum || "-"}</p>
          <br/>
          <p>Guten Appetit! 🍽️<br/>Dein MensaGo-Team</p>
        </div>
      `,
        });

        await client.close();

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("send-order-email error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
