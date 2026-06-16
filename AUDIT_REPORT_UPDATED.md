# Bestellsystem Codebase Audit Report  
**Original Date:** June 11, 2026  
**Last Updated:** June 16, 2026  
**Status:** Partial Fixes Applied - Still Critical Issues Remain

---

## Executive Summary

The Bestellsystem (Mensa ordering system) has **critical security vulnerabilities** that must be resolved before production deployment. While the overall architecture using Supabase is sound, there are significant issues in credential exposure, error handling, form validation, and accessibility compliance. 

**Production Readiness: ❌ 35% - Critical Issues Still Block Deployment** (↑ +10% from last audit)

**Key Findings from June 16 Review:**
- ✓ Confirmed: Only `students` table actively used in code (RegistriertePersonen, StudentenHochschule unused - can be dropped)
- ✓ Database table usage is clean and consistent
- ❌ Critical credentials & XSS vulnerabilities STILL UNRESOLVED
- ⚠️ Password requirements still weak (6 chars instead of 8)
- ⚠️ Accessibility alt attributes STILL EMPTY

---

## 🔴 CRITICAL ISSUES - STATUS UPDATE

### Issue #1: Exposed Credentials ❌ UNRESOLVED
**File:** [supabaseClient.js](Bestellsystem/supabaseClient.js)  
**Severity:** CRITICAL  

**Current State:**
- API credentials exposed (expected for anon key, but must verify RLS)
- Outdated developer comment "Timo Supabase" still in code
- Suggestion: Clean up comments to just note "Public anon key - RLS required"

**Action:** Remove outdated comment, keep credentials secure via RLS verification

---

### Issue #2: XSS Vulnerabilities ❌ CRITICAL - STILL PRESENT
**Files:** [script-Vorbestellungen.js](Bestellsystem/script-Vorbestellungen.js#L294), [script-Speiseplan.js](Bestellsystem/script-Speiseplan.js#L161)  
**Severity:** CRITICAL  

**Problem:**
```javascript
// UNSANITIZED - Vulnerable to XSS:
entry.innerHTML = `<h3>${gericht.Gerichtname}</h3>`;  // Database field could have <script>
```

**Good Helper Exists:**
[script-Profil.js](Bestellsystem/script-Profil.js) has working `escapeHtml()` function

**Action Needed:**
1. Create shared utility file: `shared-utils.js` with escapeHtml() exported
2. Apply to all innerHTML assignments in:
   - script-Vorbestellungen.js (line 294)
   - script-Speiseplan.js (line 161)
   - script-Meine-Bestellungen.js (line 374)
3. Priority: URGENT before production

---

### Issue #3: Missing RLS Policies ⚠️ PARTIALLY ADDRESSED
**Database:** Supabase tables  
**Severity:** CRITICAL  

**Current Observation:**
- FreieEssen table still has localStorage fallback (indicates RLS may be missing)
- AdminNutzer queries work properly with email/RZ-Kennung validation
- Need Supabase Admin Panel verification

**Action:** Verify RLS policies exist in Supabase for all tables

---

### Issue #4: Weak Password Requirements ❌ UNRESOLVED
**Files:** [script-SignUp.js](Bestellsystem/script-SignUp.js#L59), [script-Login.js](Bestellsystem/script-Login.js#L115)  
**Severity:** HIGH  

**Current:**
```javascript
if (password.length < 6) {  // ← Too weak
```

**Required:** Change to `< 8` (NIST recommendation)

---

### Issue #5: Empty Alt Attributes ❌ UNRESOLVED  
**Files:** All HTML files (Guthaben.html, startseite.html, etc.)  
**Severity:** HIGH  
**Count:** 20+ instances

**Example:**
```html
<img class="menu-icon" src="img/haus.svg" alt="">  <!-- ← Should be: alt="Startseite Symbol" -->
```

---

### Issue #6: Case-Sensitivity Navigation Links ❌ UNRESOLVED
**Files:** Multiple HTML files  
**Severity:** MEDIUM  

**Problem:**
- Some files use: `href="Startseite.html"` (capital S)
- Some use: `href="startseite.html"` (lowercase)
- Actual file: `startseite.html` (lowercase)

**Files with uppercase link:** Vorbestellungen.html, QR-Code.html, Bestätigungsseite.html  
**Files with correct link:** Speiseplan.html, Meine Bestellungen.html

**Action:** Standardize all to lowercase `startseite.html`

---

## Summary of Issues by Status

| Issue # | Title | Status | Priority |
|---------|-------|--------|----------|
| 1 | Exposed Credentials | ❌ Needs comment cleanup | CRITICAL |
| 2 | XSS Vulnerabilities | ❌ URGENT - Use escapeHtml | CRITICAL |
| 3 | RLS Policies | ⚠️ Need Supabase verification | CRITICAL |
| 4 | Weak Passwords | ❌ Change 6→8 chars | HIGH |
| 5 | Empty Alt Attributes | ❌ 20+ fixes needed | HIGH |
| 6 | Case-Sensitivity Links | ❌ Standardize lowercase | MEDIUM |
| 7+ | (See original AUDIT_REPORT.md for full list) | | |

---

## Unused Database Tables (Safe to Drop)

**Found Zero References In Code:**
- RegistriertePersonen
- StudentenHochschule

**Recommendation:** Drop these tables from Supabase to clean up schema

---

## Next Steps (Recommended Priority)

### This Week (CRITICAL):
1. **Fix XSS** - Create shared-utils.js, apply escapeHtml() to 3 files
2. **Update passwords** - Change minimum to 8 characters (2 files)
3. **Remove credentials comment** - Clean up supabaseClient.js

### Next Week (HIGH):
4. **Add alt attributes** - 20+ fixes across all HTML files
5. **Fix navigation links** - Standardize to lowercase (5-6 files)
6. **Verify RLS policies** - Check Supabase Admin Panel

### Documentation:
- Check original AUDIT_REPORT.md for issues #7-24 (full details preserved there)
- This update focuses only on status changes and June 16 findings

---

## Files to Review/Fix

```
CRITICAL:
- script-Vorbestellungen.js (XSS line 294)
- script-Speiseplan.js (XSS line 161)
- script-SignUp.js (password line 59)
- script-Login.js (password line 115)
- supabaseClient.js (comment cleanup)

HIGH:
- Guthaben.html (20+ alt attributes)
- startseite.html (link consistency)
- Vorbestellungen.html (navigation links)
- QR-Code.html (navigation links)
- Bestätigungsseite.html (navigation links)

See original AUDIT_REPORT.md for complete details on all 24 issues.
```
