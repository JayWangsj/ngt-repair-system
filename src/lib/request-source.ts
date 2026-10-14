export function isSameOriginWriteRequest(
  request: Pick<Request, "headers" | "url">,
) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site")
    return false;

  const requestUrl = new URL(request.url);
  const expectedOrigins = new Set([requestUrl.origin]);
  const host = request.headers.get("host");
  if (host)
    expectedOrigins.add(new URL(`${requestUrl.protocol}//${host}`).origin);
  for (const source of [
    request.headers.get("origin"),
    request.headers.get("referer"),
  ]) {
    if (!source) continue;
    try {
      if (!expectedOrigins.has(new URL(source).origin)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
