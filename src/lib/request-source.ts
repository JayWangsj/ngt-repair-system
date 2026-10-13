export function isSameOriginWriteRequest(
  request: Pick<Request, "headers" | "url">,
) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site")
    return false;

  const expectedOrigin = new URL(request.url).origin;
  for (const source of [
    request.headers.get("origin"),
    request.headers.get("referer"),
  ]) {
    if (!source) continue;
    try {
      if (new URL(source).origin !== expectedOrigin) return false;
    } catch {
      return false;
    }
  }
  return true;
}
