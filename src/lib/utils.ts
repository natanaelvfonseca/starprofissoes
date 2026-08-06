import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_DOMAINS = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractYouTubeVideoId(value: string): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (!YOUTUBE_DOMAINS.has(host)) {
    return null;
  }

  const pathname = url.pathname.replace(/\/+$|\s+$/g, "");

  if (host === "youtu.be") {
    return parseYouTubeVideoId(pathname.slice(1));
  }

  if (pathname === "/watch") {
    return parseYouTubeVideoId(url.searchParams.get("v") ?? "");
  }

  if (pathname.startsWith("/embed/")) {
    return parseYouTubeVideoId(pathname.split("/")[2] ?? "");
  }

  if (pathname.startsWith("/shorts/")) {
    return parseYouTubeVideoId(pathname.split("/")[2] ?? "");
  }

  if (pathname.startsWith("/live/")) {
    return parseYouTubeVideoId(pathname.split("/")[2] ?? "");
  }

  return null;
}

function parseYouTubeVideoId(value: string): string | null {
  const id = value?.trim();
  return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
}
export function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
export function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}`;
}
