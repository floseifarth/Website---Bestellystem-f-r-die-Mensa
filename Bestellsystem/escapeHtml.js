/**
 * Shared HTML-Escaping Utility.
 * Verhindert XSS durch Sonderzeichen-Escaping bei DB-Werten in innerHTML-Templates.
 */
export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
