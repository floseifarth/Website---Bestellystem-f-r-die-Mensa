const directSupabaseUrl = "http://212.71.201.100:8000";

function buildTargetUrl(req) {
    const pathParts = Array.isArray(req.query.path)
        ? req.query.path
        : req.query.path
            ? [req.query.path]
            : [];
    const incomingUrl = new URL(req.url, `https://${req.headers.host}`);
    const targetUrl = new URL(directSupabaseUrl);

    targetUrl.pathname = `/${pathParts.join("/")}`;
    targetUrl.search = incomingUrl.search;

    return targetUrl;
}

function buildProxyHeaders(req) {
    const blockedHeaders = new Set([
        "connection",
        "content-length",
        "host",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-port",
        "x-forwarded-proto",
        "x-real-ip"
    ]);

    return Object.fromEntries(
        Object.entries(req.headers).filter(([headerName]) => !blockedHeaders.has(headerName.toLowerCase()))
    );
}

function buildRequestBody(req) {
    if (req.method === "GET" || req.method === "HEAD") {
        return undefined;
    }

    if (Buffer.isBuffer(req.body) || typeof req.body === "string") {
        return req.body;
    }

    if (req.body == null) {
        return undefined;
    }

    if (typeof req.body === "object") {
        return JSON.stringify(req.body);
    }

    return String(req.body);
}

module.exports = async (req, res) => {
    const targetUrl = buildTargetUrl(req);

    try {
        const upstreamResponse = await fetch(targetUrl, {
            method: req.method,
            headers: buildProxyHeaders(req),
            body: buildRequestBody(req),
            redirect: "manual"
        });

        res.status(upstreamResponse.status);

        upstreamResponse.headers.forEach((headerValue, headerName) => {
            if (headerName.toLowerCase() === "content-encoding") {
                return;
            }

            res.setHeader(headerName, headerValue);
        });

        const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
        res.send(responseBody);
    } catch (error) {
        res.status(502).json({
            error: "supabase_proxy_failed",
            message: error instanceof Error ? error.message : String(error)
        });
    }
};