# Bestellsystem Security & Handover Audit (Updated)

Original Date: 2026-06-11  
Last Updated: 2026-06-19  
Scope: Current repository state after server migration and proxy changes

---

## Executive Summary

The project is improved compared to the previous audit, but it is still **not ready for secure student rollout**.

Current production readiness (security + handover): **55%**

Reason:
- Important infrastructure fixes were done (HTTPS-safe frontend path to Supabase via Vercel API proxy).
- Several high-impact application security and reliability issues are still open.
- RLS and operational hardening are still not fully verifiable from the repository alone.

Decision: **No go-live for broad student usage yet.**

---

## What Improved Since Last Audit

1. Supabase browser access on HTTPS pages now uses `/api/supabase` instead of direct mixed-content calls.
2. Vercel rewrite/proxy endpoint exists and is wired (`vercel.json`, `api/supabase/[...path].js`).
3. Order confirmation uses Supabase Edge Function (`send-order-email`) instead of browser-side EmailJS call.
4. `script-Profil.js` now escapes user/profile values before injecting HTML.

---

## Critical Findings (Must Fix Before Student Rollout)

### 1) Stored XSS Risk in Menu/Order Rendering (OPEN)
Severity: Critical

Unsanitized DB fields are rendered into `innerHTML` in multiple user-visible pages:
- `Bestellsystem/script-Speiseplan.js`
- `Bestellsystem/script-Vorbestellungen.js`
- `Bestellsystem/script-Meine-Bestellungen.js`

Examples include dish name, allergens, and grouped order labels directly interpolated into template strings.

Required action:
1. Introduce one shared `escapeHtml()` utility and use it consistently.
2. Prefer `textContent` for plain text nodes.
3. Re-test with payload like `<img src=x onerror=alert(1)>` in dish/allergen fields.

---

### 2) Password Policy Too Weak (OPEN)
Severity: High (security)

Current checks still accept 6-char passwords in:
- `Bestellsystem/script-Login.js`
- `Bestellsystem/script-SignUp.js`
- `Bestellsystem/script-Passwort-zuruecksetzen.js`

Required action:
1. Raise minimum length to at least 8 (better: 10+ passphrase-friendly).
2. Keep messaging consistent across signup/login/reset.
3. Add server-side policy enforcement (not only frontend checks).

---

### 3) RLS/Authorization Hardening Not Fully Verifiable (OPEN)
Severity: Critical

Repository shows SQL job logic for `FreieEssen`, but no complete source of truth for active production policies.
Admin script still includes localStorage fallback in DB error cases.

Required action:
1. Confirm `ENABLE ROW LEVEL SECURITY` for all business tables.
2. Document and test policies for `authenticated` and admin-only operations.
3. Remove or heavily restrict localStorage fallback for admin-critical counters.
4. Add an explicit RLS verification checklist to handover docs.

---

### 4) Transport Security Gap in Upstream Proxy Path (OPEN)
Severity: Critical

`api/supabase/[...path].js` proxies to:
- `http://212.71.201.100:8000`

This means the serverless proxy-to-upstream leg is plain HTTP.
If this traffic traverses public networks, bearer tokens/session traffic may be exposed.

Required action:
1. Move upstream to HTTPS endpoint.
2. If internal-only network is intended, document and enforce network boundaries.
3. Remove HTTP direct fallback in frontend for non-local production contexts.

---

## High Priority Findings

### 5) Accessibility: Many Empty alt Attributes (OPEN)
Severity: High (WCAG compliance / usability)

Current grep result shows many empty `alt=""` icon/menu images across main HTML pages.

Required action:
1. Add meaningful alt text where informative.
2. Use `alt=""` only for truly decorative images.
3. Run accessibility pass (keyboard + screen reader quick checks).

---

### 6) Navigation Link Case Mismatch (OPEN)
Severity: Medium (stability/deployment)

Both `Startseite.html` and `startseite.html` are referenced in links, while the file is lowercase.
This can break navigation depending on hosting/filesystem behavior.

Required action:
1. Standardize all links to `startseite.html`.
2. Add one redirect fallback only if legacy links must be supported.

---

### 7) Missing Security Headers/CSP at Runtime (OPEN)
Severity: High

No enforced runtime CSP/HSTS/X-Frame-Options policy is defined in deployment config.

Required action:
1. Add strict CSP (iteratively tuned for required CDNs).
2. Add `Strict-Transport-Security`, `X-Frame-Options` or `frame-ancestors`, `Referrer-Policy`.
3. Validate headers in live environment (not only local).

---

## Medium Priority / Handover Gaps

1. Some async paths still fail with console-only diagnostics and weak user feedback.
2. No evidence of automated security regression tests (XSS policy checks, auth abuse checks).
3. No explicit incident/runbook section for ops handover (key rotation, outage fallback, RLS rollback).

---

## Updated Go-Live Gate (Student Use)

All items below should be completed before declaring handover done:

1. XSS remediated in all affected render paths and regression-tested.
2. Password policy raised and consistently enforced frontend + backend.
3. Production RLS policies verified and documented per table/role.
4. Proxy upstream switched to HTTPS (or network-isolated equivalent with documented controls).
5. Security headers enabled and validated on live URL.
6. Empty alt attributes cleaned and basic accessibility pass completed.
7. Navigation case mismatch fixed everywhere.
8. Admin fallback behavior hardened (no silent localStorage shadow state for critical counters).
9. Short handover document added: architecture, secrets rotation, RLS map, backup/restore, on-call steps.

---

## Suggested Execution Order (Fastest Risk Reduction)

Phase 1 (Day 1-2):
1. XSS fixes + tests
2. Password policy upgrade
3. Navigation case cleanup

Phase 2 (Day 2-4):
1. RLS verification + docs
2. Remove/restrict admin local fallback
3. Accessibility alt-text sweep

Phase 3 (Day 4-5):
1. HTTPS upstream proxy hardening
2. Security headers + CSP rollout
3. Final pre-handover smoke test and sign-off

---

## Final Assessment (2026-06-19)

Status: **NOT handover-ready yet**  
Primary blockers: **XSS, RLS verification, transport security, password strength**

Once the Go-Live Gate above is fully checked, the system can be reassessed for student rollout and formal handover.
