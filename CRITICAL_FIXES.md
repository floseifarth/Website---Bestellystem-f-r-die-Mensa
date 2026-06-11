# Quick Reference: Critical Issues to Fix Immediately

## 🔴 CRITICAL - Fix Before Any Deployment

### 1. Exposed Credentials (supabaseClient.js)
```javascript
// REMOVE THIS:
//const supabaseUrl = "https://ghhqyjmoovsxrkyzxppb.supabase.co";
//const supabaseAnonKey = "sb_publishable_ESiDPxYboQbnR1ROIHB6CA_dgKXjtlt";

// ACTION: Rotate both Supabase API keys immediately
```

### 2. Missing RLS Policies
**Database Issue:** FreieEssen table needs RLS for authenticated users
```sql
-- Add to Supabase:
CREATE POLICY "authenticated_can_select" ON FreieEssen
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins_can_update" ON FreieEssen
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM AdminNutzer WHERE id = auth.uid()
  ));
```

### 3. XSS Vulnerabilities - Add to 3 files
Use this pattern everywhere (already in script-Profil.js):
```javascript
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// In script-Speiseplan.js line 161:
// CHANGE: <h3>${gericht.Gerichtname}</h3>
// TO: <h3>${escapeHtml(gericht.Gerichtname)}</h3>

// Same fix needed in:
// - script-Vorbestellungen.js line 294
// - script-Meine-Bestellungen.js line 374
```

### 4. Silent Errors - Add Feedback
Files that fail silently: script-Speiseplan.js, script-Profil.js, script-QR-Code.js
```javascript
// BEFORE:
if (error) {
    console.error("Fehler beim Laden:", error);
    return;
}

// AFTER:
if (error) {
    console.error("Fehler beim Laden:", error);
    const container = document.getElementById("some-container");
    if (container) {
        container.innerHTML = '<p style="color: red;">Fehler beim Laden. Bitte später erneut versuchen.</p>';
    }
    return;
}
```

### 5. Guthaben Feature - Choose Action
**Option A: Remove Completely**
- Delete Guthaben.html
- Delete script-Guthaben.js
- Remove from navigation in all files

**Option B: Complete Implementation**
- Implement payment processing (Supabase function or external service)
- Add real balance from database
- Handle top-up transactions

---

## 🟠 HIGH - Fix Within 1 Week

### 6. Fix Alt Attributes (20+ instances)
```html
<!-- BEFORE -->
<img class="menu-icon" src="img/haus.svg" alt="">

<!-- AFTER -->
<img class="menu-icon" src="img/haus.svg" alt="Startseite">
<img class="menu-icon" src="img/speise.svg" alt="Speiseplan">
<img class="menu-icon" src="img/shopping.svg" alt="Vorbestellung">
<img class="menu-icon" src="img/Liste.svg" alt="Meine Bestellungen">
<img class="menu-icon" src="img/QR-Code.svg" alt="QR-Code">
<img class="menu-icon" src="img/Profil.svg" alt="Profil">
```

### 7. Fix Navigation Links (Case Sensitivity)
```html
<!-- In Vorbestellungen.html line 45: -->
<!-- CHANGE: href="Startseite.html" -->
<!-- TO: href="startseite.html" -->
```

### 8. Add Media Queries to CSS
Files missing media queries:
- style-Speiseplan.css
- style-Meine-Bestellungen.css
- style-Vorbestellungen.css
- style-Guthaben.css
- style-Profil.css
- style-QR-Code.css

Add to each:
```css
@media (max-width: 640px) {
    .header {
        flex-direction: column;
    }
    
    .hauptfeld-mitte {
        width: 100%;
        padding: 10px;
    }
}
```

### 9. Add CSP Headers (Server-Side)
Add to your web server configuration (nginx, Apache, etc.):
```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net https://esm.sh;
  style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
  font-src https://fonts.gstatic.com;
  img-src 'self' data:;
```

### 10. Strengthen Password Requirements
```javascript
// In script-Login.js line 115 and script-SignUp.js line 59:
// CHANGE: if (password.length < 6)
// TO: if (password.length < 8)

// Add message update:
// setMessage("Passwort muss mindestens 8 Zeichen haben.", true);
```

---

## 🟡 MEDIUM - Fix Within 2 Weeks

### 11. Add Try-Catch to Async Functions
Affected files:
- script-Speiseplan.js
- script-Vorbestellungen.js
- script-Meine-Bestellungen.js

Pattern:
```javascript
// BEFORE:
async function ladeDaten() {
    const { data, error } = await supabase.from("table").select("*");
    if (error) {
        console.error(error);
        return;
    }
}

// AFTER:
async function ladeDaten() {
    try {
        const { data, error } = await supabase.from("table").select("*");
        if (error) {
            throw new Error(error.message);
        }
        // process data
    } catch (err) {
        console.error("Fehler:", err);
        // show user message
    }
}
```

### 12. Implement Rate Limiting (Client-Side)
```javascript
let lastLoginAttempt = 0;
const LOGIN_COOLDOWN_MS = 5000;

function login() {
    const now = Date.now();
    if (now - lastLoginAttempt < LOGIN_COOLDOWN_MS) {
        setMessage("Bitte warten Sie, bevor Sie es erneut versuchen.", true);
        return;
    }
    lastLoginAttempt = now;
    // ... rest of login logic
}
```

---

## 📋 Testing Checklist

Before deploying to production:

- [ ] All alt attributes are descriptive
- [ ] No console errors on page load
- [ ] Error messages appear when API fails
- [ ] Navigation links work on all pages
- [ ] Pages are readable on mobile (640px viewport)
- [ ] QR code generation works
- [ ] Login works with valid credentials
- [ ] Login fails gracefully with invalid credentials
- [ ] Registration flow completes
- [ ] Orders can be placed and viewed
- [ ] No XSS if dish name contains `<script>`
- [ ] Admin page loads (has proper RLS)
- [ ] Rate limiting works (try clicking button rapidly)

---

## 📚 Documentation Links

- Full audit report: [AUDIT_REPORT.md](AUDIT_REPORT.md)
- Supabase RLS docs: https://supabase.com/docs/guides/auth/row-level-security
- WCAG 2.1 Alt Text: https://www.w3.org/WAI/WCAG21/Understanding/non-text-content
- OWASP XSS Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

---

## Timeline Estimate

| Phase | Time | Items | Priority |
|-------|------|-------|----------|
| 1 | 1 day | Credentials, RLS, XSS, Errors, Password | CRITICAL |
| 2 | 3 days | Alt text, Nav links, Media queries, CSP | HIGH |
| 3 | 5 days | Try-catch, Rate limiting, RLS docs, Tests | MEDIUM |
| 4+ | 2 weeks | Build system, Tests, Optimization | NICE-TO-HAVE |
| **TOTAL** | **~2 weeks** | **All Critical + High items** | **Launch-ready** |

---

**Last Updated:** June 11, 2026  
**Status:** In Review  
**Next Steps:** Begin Phase 1 critical fixes
