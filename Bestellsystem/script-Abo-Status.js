import { supabase } from "./supabaseClient.js";

const BADGE_CACHE_KEY = "mensa-badge-status-v1";
const BADGE_CACHE_TTL_MS = 90 * 1000;
let prefetchInitDone = false;

function todayIso() {
    return new Date().toISOString().split("T")[0];
}

function readCachedBadge() {
    try {
        const raw = sessionStorage.getItem(BADGE_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        const age = Date.now() - Number(parsed.cachedAt || 0);
        if (!Number.isFinite(age) || age > BADGE_CACHE_TTL_MS) return null;

        if (parsed.isoDate !== todayIso()) return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

function writeCachedBadge(userId, className, textContent) {
    try {
        if (!userId) {
            sessionStorage.removeItem(BADGE_CACHE_KEY);
            return;
        }

        sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({
            userId,
            className,
            textContent,
            isoDate: todayIso(),
            cachedAt: Date.now()
        }));
    } catch (_error) {
        // Ignore cache errors.
    }
}

function applyBadgeState(badge, className, textContent) {
    if (!badge) return;
    badge.style.display = "inline-block";
    badge.className = className || "bestellstatus-badge";
    badge.textContent = textContent || "Keine aktive Bestellung";
}

function initNavPrefetch() {
    if (prefetchInitDone) return;
    prefetchInitDone = true;

    const prefetched = new Set();
    const anchors = document.querySelectorAll("a[href]");

    function prefetch(rawHref) {
        if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
            return;
        }

        const url = new URL(rawHref, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (!url.pathname.endsWith(".html")) return;
        if (url.href === window.location.href || prefetched.has(url.href)) return;

        prefetched.add(url.href);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "document";
        link.href = url.href;
        document.head.appendChild(link);
    }

    anchors.forEach(function (anchor) {
        const href = anchor.getAttribute("href") || "";
        anchor.addEventListener("pointerenter", function () { prefetch(href); }, { passive: true });
        anchor.addEventListener("focus", function () { prefetch(href); });
    });
}

async function updateHeaderStatusBadge() {
    initNavPrefetch();

    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    const cached = readCachedBadge();
    if (cached) {
        applyBadgeState(badge, cached.className, cached.textContent);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
        badge.style.display = "none";
        return;
    }

    const isoToday = todayIso();
    const { data } = await supabase
        .from("Bestellungen")
        .select("id, status")
        .eq("auth_user_id", user.id)
        .eq("bestell_datum", isoToday);

    const rows = Array.isArray(data) ? data : [];
    const hasActiveOrder = rows.some(function (r) {
        return r.status === "bestellt" || r.status === "abgeholt" || !r.status;
    });

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const pickupStart = 12 * 60;
    const pickupEnd = 13 * 60 + 15;
    const inPickupWindow = minutes >= pickupStart && minutes < pickupEnd;

    let className = "bestellstatus-badge";
    let textContent = "Keine aktive Bestellung";

    if (inPickupWindow && hasActiveOrder) {
        className += " badge-essensvergabe";
        textContent = "Essensvergabe";
    } else if (hasActiveOrder) {
        className += " badge-vorbestellt";
        textContent = "Vorbestellt";
    } else {
        className += " badge-keine";
        textContent = "Keine aktive Bestellung";
    }

    applyBadgeState(badge, className, textContent);
    writeCachedBadge(user.id, className, textContent);
}

updateHeaderStatusBadge().catch(function () {
    // Keep pages functional even when status lookup fails.
});
