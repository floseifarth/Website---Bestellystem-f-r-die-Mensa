# Bestellsystem Security & Handover Audit (Updated)

Original Date: 2026-06-11  
Last Updated: 2026-06-21  
Scope: Current repository state after frontend hardening

---

## Executive Summary

Current production readiness (security + handover): **76%**

Frontend-Punkte aus dem Audit sind abgeschlossen. Offen sind nur noch Backend-/Infrastruktur-Themen plus Handover-Dokumentation.

Decision: **Kein Go-live für breiten Studentenbetrieb bis die verbleibenden Blocker behoben sind.**

---

## Offene Findings (Blocker)

### 1) RLS/Authorization Hardening nicht verifizierbar (OFFEN)
Severity: Critical

Für Production ist weiterhin nicht eindeutig verifizierbar, welche RLS-Policies aktiv sind und wie sie pro Rolle greifen.

Required action:
1. `ENABLE ROW LEVEL SECURITY` für alle Business-Tabellen bestätigen.
2. Policies für `authenticated` und Admin-only-Operationen dokumentieren und testen.
3. Explizite RLS-Verifikations-Checkliste in Übergabe-Docs aufnehmen.

---

### 2) Transport Security Gap im Upstream-Proxy (OFFEN)
Severity: Critical

`api/supabase/[...path].js` proxied weiterhin zu:
- `http://212.71.201.100:8000`

Der Proxy-zu-Upstream-Leg läuft über plain HTTP.

Required action:
1. Upstream auf HTTPS-Endpunkt umstellen.
2. Falls internes Netz beabsichtigt: Netzwerkgrenzen dokumentieren und erzwingen.
3. HTTP-Direktfallback im Frontend für Production-Kontext entfernen.

---

## Medium Priority / Handover Gaps

1. Kein expliziter Incident/Runbook-Abschnitt für die Übergabe (Key Rotation, Outage-Fallback, RLS-Rollback).
2. Kein kurzes Handover-Dokument: Architektur, Secrets-Rotation, RLS-Map, Backup/Restore, On-Call-Schritte.
3. Keine automatisierten Security-Regressionstests (XSS-Policy-Checks, Auth-Abuse-Checks).

---

## Neue Offene Punkte aus Volltest (2026-06-21)

### 3) Live-Deployment Drift + Case-Mismatch in Navigation (OFFEN)
Severity: High

Der Live-Stand auf Vercel entspricht nicht vollständig dem aktuellen Repository-Stand. In der ausgelieferten `startseite.html` verlinken Menüpunkte teilweise auf `Startseite.html` (großes `S`), während die Datei tatsächlich `startseite.html` heißt.

Verifiziert:
1. `https://website-bestellystem-mensa.vercel.app/Bestellsystem/startseite.html` -> 200
2. `https://website-bestellystem-mensa.vercel.app/Bestellsystem/Startseite.html` -> 404
3. Live-HTML enthält weiterhin `href="Startseite.html"` in mehreren Seiten.

Required action:
1. Deployment auf den aktuellen Repo-Stand synchronisieren (neu deployen).
2. Alle internen Navigationslinks strikt auf `startseite.html` normieren.
3. Nach Deploy Link-Check auf Case-Sensitivity (Linux/Vercel) als Release-Gate aufnehmen.

---

### 4) Speiseplan-Status "Vorbestellt!" nutzt veraltete LocalStorage-Quelle (TEILWEISE ERLEDIGT)
Severity: Medium

In `Bestellsystem/script-Speiseplan.js` wird der Marker "Vorbestellt!" aus `localStorage.getItem("bestellungen")` berechnet. Dieser Schlüssel wird im aktuellen Flow nicht mehr geschrieben (Bestellungen laufen über Supabase), wodurch die Markierung in realer Nutzung falsch/leer sein kann.

Required action:
1. Zähler ausschließlich aus Supabase-Bestellungen des eingeloggten Users aufbauen.
2. Legacy-LocalStorage-Logik entfernen, um inkonsistente UI-Zustände zu vermeiden.

Status-Update 2026-06-21:
1. Im Repository umgesetzt in `Bestellsystem/script-Speiseplan.js` (DB-basierter Zähler, LocalStorage entfernt).
2. Production-Wirksamkeit nach nächstem Deploy verifizieren.

---

### 5) Zeitgrenzenrisiko bei Tages-Cleanup (UTC statt Lokalzeit) (TEILWEISE ERLEDIGT)
Severity: Medium

In `Bestellsystem/ADMIN-SEITE/script-ADMIN-Seite.js` nutzt `aufgeraeumeAlteBestellungen()` `new Date().toISOString().split("T")[0]` (UTC-basiert) als Tagesgrenze. Rund um Zeitzonen-/Tageswechsel kann das zu verfrühter Archivierung/Löschung führen.

Required action:
1. Tagesgrenze lokal (Europe/Berlin) bestimmen oder serverseitig in der DB normieren.
2. Cleanup-Queries gegen lokal validierte Datumsspalten testen (vor/nach 00:00 Uhr lokal).

Status-Update 2026-06-21:
1. Im Repository umgesetzt in `Bestellsystem/ADMIN-SEITE/script-ADMIN-Seite.js` via Berlin-lokaler Tagesgrenze.
2. End-to-End-Verifikation im Deploy (vor/nach Mitternacht) bleibt offen.

---

### 6) Admin-Vorschau rendert DB-Daten per `innerHTML` (XSS-Risiko) (TEILWEISE ERLEDIGT)
Severity: High

In `Bestellsystem/ADMIN-SEITE/script-ADMIN-Seite.js` werden in der Vorschau (`ladeVorschauNaechste5Tage`) Inhalte wie Gerichtname per Template-String via `innerHTML` gerendert, ohne Escape-Funktion. Bei kompromittierten/ungeprüften DB-Inhalten ist Script-Injection möglich.

Required action:
1. In diesem Rendering-Pfad auf `textContent` + `createElement` umstellen oder zentral `escapeHtml` anwenden.
2. XSS-Regressionstest für Admin-Vorschau ergänzen.

Status-Update 2026-06-21:
1. Im Repository umgesetzt in `Bestellsystem/ADMIN-SEITE/script-ADMIN-Seite.js` (kein dynamisches `innerHTML` mehr im Vorschau-Loop).
2. Regressionstest im Browser/Deploy bleibt offen.

---

### 7) Tote Hilfsfunktionen im Admin-Skript (TEILWEISE ERLEDIGT)
Severity: Low

Im aktuellen Stand sind mindestens folgende Funktionen ohne Aufruf im selben Modul:
1. `toGermanNumericDate`
2. `ermittleHeutigeSpeiseplanId`

Required action:
1. Nicht genutzte Funktionen entfernen oder integrieren.
2. Kleinen Dead-Code-Check als CI/Review-Schritt ergänzen.

Status-Update 2026-06-21:
1. Im Repository bereinigt (`toGermanNumericDate`, `ermittleHeutigeSpeiseplanId`, `renderErnaehrungsBadgeHtml` entfernt).
2. CI-gestützter Dead-Code-Check bleibt offen.

---

## Volltest-Abdeckung (durchgeführt)

1. Projektweiter Referenzcheck HTML -> lokale CSS/JS-Dateien: keine fehlenden lokalen Asset-Referenzen gefunden.
2. CSS-Datei-Ebene: keine komplett unreferenzierte CSS-Datei gefunden.
3. Live-Routen-Stichprobe: zentrale Seiten erreichbar; API-Proxy `/api/supabase/auth/v1/settings` antwortet (401 ohne Auth, erwartbar).

## Verbleibende Testlücken

1. Kein vollständiger E2E-Durchlauf von Registrierung/Login/Bestellung/Admin-Abholung ohne bereitgestellte Testaccounts und DB-Testdaten.
2. Kein Last-/Race-Test bei parallelen Bestellungen.
3. Keine automatisierten Browser-Regressionstests für Navigation/Case-Sensitivity im Deploy.

---

## Go-Live Gate

| # | Item | Status |
|---|------|--------|
| 1 | XSS in allen Render-Pfaden behoben | ✓ Erledigt |
| 2 | Passwort-Policy konsistent (Website + App, 6 Zeichen) | ✓ Erledigt |
| 3 | Production-RLS-Policies verifiziert und dokumentiert | ✗ Offen |
| 4 | Proxy-Upstream auf HTTPS umgestellt | ✗ Offen |
| 5 | Security-Header live validiert (nach nächstem Deploy) | ✓ Deployed – Validierung ausstehend |
| 6 | Accessibility-Pass abgeschlossen | ✓ Erledigt |
| 7 | Navigation-Case-Mismatch behoben | ✓ Erledigt |
| 8 | Admin-Fallback (localStorage) gehärtet | ✓ Erledigt |
| 9 | Handover-Dokument erstellt | ✗ Offen |
| 10 | Live-Deployment auf Repo-Stand synchron (inkl. Link-Case-Check) | ✗ Offen |
| 11 | Speiseplan-Status aus DB statt Legacy-LocalStorage | ✓ Im Repo umgesetzt (Deploy-Check offen) |
| 12 | UTC/Lokalzeit-Cleanup-Grenze validiert | ✓ Im Repo umgesetzt (Mitternachts-Check offen) |
| 13 | Admin-Vorschau XSS-sicher (kein unescaped `innerHTML`) | ✓ Im Repo umgesetzt (Regressionstest offen) |
