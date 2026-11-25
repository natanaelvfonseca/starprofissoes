import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const compress = promisify(gzip);

function acceptsGzip(value: string) {
  const encodings = value.toLowerCase().split(",").map((entry) => {
    const [name, ...params] = entry.trim().split(";");
    const quality = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
    return { name: name.trim(), quality: quality ? Number(quality.slice(2)) : 1 };
  });
  return ((encodings.find((entry) => entry.name === "gzip") ??
    encodings.find((entry) => entry.name === "*"))?.quality ?? 0) > 0;
}

// Always called AFTER authentication, unit and role checks. No shared cache.
export async function leadListResponse(request: Request, payload: unknown): Promise<Response> {
  const json = JSON.stringify(payload);
  const etag = 'W/"' + createHash("sha256").update(json).digest("base64url") + '"';
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Accept-Encoding, Cookie",
    "ETag": etag,
  });
  const previous = request.headers.get("If-None-Match");
  if (previous?.split(",").some((value) => value.trim() === etag || value.trim() === etag.slice(2) || value.trim() === "*")) {
    return new Response(null, { status: 304, headers });
  }
  if (Buffer.byteLength(json) >= 1024 && acceptsGzip(request.headers.get("Accept-Encoding") ?? "")) {
    const zipped = await compress(json, { level: 4 });
    headers.set("Content-Encoding", "gzip");
    return new Response(new Uint8Array(zipped), { headers });
  }
  return new Response(json, { headers });
}
