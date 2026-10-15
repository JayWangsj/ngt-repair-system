type RequestSource = Pick<Request, "headers" | "url">;

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function getLoopbackOrigins(request: RequestSource) {
  const requestUrl = new URL(request.url);
  if (!isLoopbackHost(requestUrl.hostname)) return null;
  const origins = new Set([requestUrl.origin]);
  const host = request.headers.get("host");
  if (host) {
    try {
      const hostUrl = new URL(`${requestUrl.protocol}//${host}`);
      if (!isLoopbackHost(hostUrl.hostname)) return null;
      origins.add(hostUrl.origin);
    } catch {
      return null;
    }
  }
  return origins;
}

function hasConflictingSource(
  request: RequestSource,
  allowedOrigins: Set<string>,
) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site")
    return true;
  for (const source of [
    request.headers.get("origin"),
    request.headers.get("referer"),
  ]) {
    if (!source) continue;
    try {
      if (!allowedOrigins.has(new URL(source).origin)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function isLoopbackRequest(request: RequestSource) {
  const allowedOrigins = getLoopbackOrigins(request);
  return (
    allowedOrigins !== null && !hasConflictingSource(request, allowedOrigins)
  );
}

export function isSameOriginRequest(request: RequestSource) {
  const allowedOrigins = getLoopbackOrigins(request);
  if (!allowedOrigins || hasConflictingSource(request, allowedOrigins))
    return false;
  const source =
    request.headers.get("origin") || request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (!source && fetchSite !== "same-origin") return false;
  if (source) {
    try {
      return allowedOrigins.has(new URL(source).origin);
    } catch {
      return false;
    }
  }
  return true;
}

export const isSameOriginWriteRequest = isSameOriginRequest;
