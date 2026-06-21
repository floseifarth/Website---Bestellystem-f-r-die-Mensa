# Bestellsystem Security & Handover Audit (Updated)

Original Date: 2026-06-11  
Last Updated: 2026-06-21  
Scope: Current repository state after frontend hardening

---

## Executive Summary

Current production readiness (security + handover): **82%**

Erledigte Punkte wurden aus diesem Report entfernt. Dieses Dokument enthält nur noch offene Themen.

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

## Offene Handover Gaps

1. Kein expliziter Incident/Runbook-Abschnitt für die Übergabe (Key Rotation, Outage-Fallback, RLS-Rollback).
2. Kein kurzes Handover-Dokument: Architektur, Secrets-Rotation, RLS-Map, Backup/Restore, On-Call-Schritte.
3. Keine automatisierten Security-Regressionstests (XSS-Policy-Checks, Auth-Abuse-Checks).

---

## Offene Verifikationen / Testlücken

1. Kein vollständiger E2E-Durchlauf von Registrierung/Login/Bestellung/Admin-Abholung ohne bereitgestellte Testaccounts und DB-Testdaten.
2. Kein Last-/Race-Test bei parallelen Bestellungen.
3. Keine automatisierten Browser-Regressionstests für Navigation/Case-Sensitivity im Deploy.
4. Mitternachts-Verifikation für lokalen Tages-Cleanup (Europe/Berlin) steht noch aus.

---

## Go-Live Gate (Nur Offene Items)

| # | Item | Status |
|---|------|--------|
| 3 | Production-RLS-Policies verifiziert und dokumentiert | ✗ Offen |
| 4 | Proxy-Upstream auf HTTPS umgestellt | ✗ Offen |
| 9 | Handover-Dokument erstellt | ✗ Offen |
| 10 | Case-Sensitivity Link-Check als automatisches Release-Gate | ✗ Offen |
| 11 | Browser-Regressionstest für sicherheitsrelevante Flows | ✗ Offen |
| 12 | Mitternachts-Check für Tages-Cleanup (Berlin) | ✗ Offen |
