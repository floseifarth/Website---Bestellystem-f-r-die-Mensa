import { supabase } from "./supabaseClient.js";

const USER_DISPLAY_NAME_CACHE_KEY = "mensa-user-display-name-v1";
const USER_CONTEXT_CACHE_KEY = "mensa-user-context-v1";
const USER_CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;
let navigationPrefetchInitialized = false;

function initNavigationPrefetch() {
    if (navigationPrefetchInitialized || typeof document === "undefined") {
        return;
    }
    navigationPrefetchInitialized = true;

    const prefetched = new Set();

    function toPrefetchUrl(rawHref) {
        if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
            return null;
        }

        const url = new URL(rawHref, window.location.href);
        if (url.origin !== window.location.origin) {
            return null;
        }
        if (!url.pathname.endsWith(".html")) {
            return null;
        }

        return url.href;
    }

    function prefetch(href) {
        const url = toPrefetchUrl(href);
        if (!url || prefetched.has(url) || url === window.location.href) {
            return;
        }
        prefetched.add(url);

        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "document";
        link.href = url;
        document.head.appendChild(link);
    }

    const anchors = document.querySelectorAll("a[href]");
    anchors.forEach(function (anchor) {
        const href = anchor.getAttribute("href") || "";
        anchor.addEventListener("pointerenter", function () {
            prefetch(href);
        }, { passive: true });
        anchor.addEventListener("focus", function () {
            prefetch(href);
        });
    });

    const eagerLinks = Array.from(anchors)
        .map(function (anchor) { return anchor.getAttribute("href") || ""; })
        .filter(Boolean)
        .slice(0, 6);

    window.setTimeout(function () {
        eagerLinks.forEach(prefetch);
    }, 250);
}

function readCachedUserContext() {
    try {
        const raw = sessionStorage.getItem(USER_CONTEXT_CACHE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        const age = Date.now() - Number(parsed.cachedAt || 0);
        if (!Number.isFinite(age) || age > USER_CONTEXT_CACHE_TTL_MS) {
            return null;
        }

        return parsed;
    } catch (_error) {
        return null;
    }
}

function writeCachedUserContext(user, profile, displayName, email) {
    try {
        if (!user?.id) {
            sessionStorage.removeItem(USER_CONTEXT_CACHE_KEY);
            return;
        }

        sessionStorage.setItem(USER_CONTEXT_CACHE_KEY, JSON.stringify({
            userId: user.id,
            profile: profile || null,
            displayName: String(displayName || "").trim(),
            email: String(email || "").trim(),
            cachedAt: Date.now()
        }));
    } catch (_error) {
        // Ignore cache write errors.
    }
}

function clearCachedUserContext() {
    try {
        sessionStorage.removeItem(USER_CONTEXT_CACHE_KEY);
    } catch (_error) {
        // Ignore cache clear errors.
    }
}

async function refreshUserContextCache(user) {
    if (!user) {
        return null;
    }

    const profile = await resolveStudentProfile(user);
    const displayName = resolveDisplayName(user, profile);
    const email = resolvePreferredEmail(user, profile);

    writeCachedDisplayName(displayName);
    writeCachedUserContext(user, profile, displayName, email);

    return {
        user,
        profile,
        displayName,
        email,
        sessionError: null
    };
}

function readCachedDisplayName() {
    try {
        return String(sessionStorage.getItem(USER_DISPLAY_NAME_CACHE_KEY) || "").trim();
    } catch (_error) {
        return "";
    }
}

function writeCachedDisplayName(displayName) {
    try {
        const normalized = String(displayName || "").trim();
        if (!normalized || normalized === "Gast") {
            sessionStorage.removeItem(USER_DISPLAY_NAME_CACHE_KEY);
            return;
        }
        sessionStorage.setItem(USER_DISPLAY_NAME_CACHE_KEY, normalized);
    } catch (_error) {
        // Ignore storage errors to keep auth flow stable.
    }
}

function clearCachedDisplayName() {
    try {
        sessionStorage.removeItem(USER_DISPLAY_NAME_CACHE_KEY);
    } catch (_error) {
        // Ignore storage errors.
    }
}

function hydrateDisplayNameInDomFromCache() {
    const cached = readCachedDisplayName();
    if (!cached) {
        return;
    }

    const targets = document.querySelectorAll("#user-display-name");
    targets.forEach(function (element) {
        const current = String(element.textContent || "").trim().toLowerCase();
        if (!current || current.includes("anmelden")) {
            element.textContent = cached;
        }
    });
}

export async function resolveStudentProfile(user) {
    if (!user?.id && !user?.email) {
        return null;
    }

    let profile = null;

    if (user?.id) {
        const { data, error } = await supabase
            .from("students")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (!error && data) {
            profile = data;
        }
    }

    if (!profile && user?.email) {
        const { data, error } = await supabase
            .from("students")
            .select("*")
            .ilike("email", user.email)
            .maybeSingle();

        if (!error && data) {
            profile = data;
        }
    }

    return profile;
}

export function resolveDisplayName(user, profile) {
    const profileVorname = String(profile?.vorname || profile?.Vorname || "").trim();
    if (profileVorname) {
        return profileVorname;
    }

    const fullName = String(user?.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = String(profile?.email || user?.email || "").trim();
    if (email.includes("@")) {
        return email.split("@")[0];
    }

    return email || "Gast";
}

export function resolvePreferredEmail(user, profile) {
    return String(profile?.email || user?.email || "").trim();
}

export async function loadCurrentUserContext() {
    initNavigationPrefetch();

    // Show last known display name instantly while session/profile are loading.
    hydrateDisplayNameInDomFromCache();

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user || null;

    if (sessionError || !user) {
        clearCachedDisplayName();
        clearCachedUserContext();
        return {
            user: null,
            profile: null,
            displayName: "Gast",
            email: "",
            sessionError: sessionError || null
        };
    }

    const cached = readCachedUserContext();
    if (cached && cached.userId === user.id) {
        const cachedDisplayName = String(cached.displayName || "").trim();
        const displayName = cachedDisplayName || resolveDisplayName(user, cached.profile || null);
        writeCachedDisplayName(displayName);

        // Refresh profile cache in background without blocking UI.
        refreshUserContextCache(user).catch(function () {
            // Keep stale cache if refresh fails.
        });

        return {
            user,
            profile: cached.profile || null,
            displayName,
            email: String(cached.email || user.email || "").trim(),
            sessionError: null
        };
    }

    const freshContext = await refreshUserContextCache(user);
    if (freshContext) {
        return freshContext;
    }

    return {
        user,
        profile: null,
        displayName: resolveDisplayName(user, null),
        email: resolvePreferredEmail(user, null),
        sessionError: null
    };
}