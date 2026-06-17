import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || "0000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "9999";
const SESSION_COOKIE = "familytube_session";
const MEDIA_DIR = path.join(__dirname, "media");
const VIDEO_DIR = path.join(MEDIA_DIR, "videos");
const THUMB_DIR = path.join(MEDIA_DIR, "thumbnails");
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "videos.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

await ensureStorage();

process.on("uncaughtException", (error) => {
  if (error?.code === "ERR_STREAM_PREMATURE_CLOSE") {
    console.warn("Client closed a stream before it finished.");
    return;
  }
  throw error;
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/login") {
      return serveFile(res, path.join(PUBLIC_DIR, "login.html"));
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      return handleLogin(req, res);
    }

    if (req.method === "GET" && url.pathname === "/admin") {
      return serveFile(res, path.join(PUBLIC_DIR, "admin.html"));
    }

    if (req.method === "POST" && url.pathname === "/api/admin-login") {
      return handleAdminLogin(req, res);
    }

    if (url.pathname.startsWith("/public/")) {
      return serveStatic(res, PUBLIC_DIR, url.pathname.replace("/public/", ""));
    }

    if (url.pathname.startsWith("/media/")) {
      if (!isAllowed(req)) return redirect(res, "/login");
      return serveStatic(res, MEDIA_DIR, url.pathname.replace("/media/", ""), true, req);
    }

    if (!isAllowed(req)) return redirect(res, "/login");

    if (req.method === "GET" && url.pathname === "/") {
      return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
    }

    if (req.method === "GET" && url.pathname === "/watch") {
      return serveFile(res, path.join(PUBLIC_DIR, "watch.html"));
    }

    if (req.method === "GET" && url.pathname === "/api/videos") {
      return json(res, 200, await listVideos());
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      return json(res, 200, { role: getSessionRole(req), isAdmin: isAdmin(req) });
    }

    if (req.method === "POST" && url.pathname === "/api/upload") {
      if (!isAdmin(req)) return json(res, 403, { error: "admin_required" });
      return handleUpload(req, res);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/videos/")) {
      if (!isAdmin(req)) return json(res, 403, { error: "admin_required" });
      return handleDeleteVideo(req, res, decodeURIComponent(url.pathname.replace("/api/videos/", "")));
    }

    notFound(res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "server_error" });
  }
});

server.listen(PORT, () => {
  console.log(`FamilyTube is running at http://localhost:${PORT}`);
  console.log(`Viewer password: ${FAMILY_PASSWORD}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});

async function ensureStorage() {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, "[]\n");
  }
}

async function listVideos() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function saveVideos(videos) {
  await fs.writeFile(DB_PATH, `${JSON.stringify(videos, null, 2)}\n`);
}

async function handleLogin(req, res) {
  const body = await readBody(req, 20_000);
  const params = new URLSearchParams(body);
  if (params.get("password") !== FAMILY_PASSWORD) {
    return redirect(res, "/login?error=1");
  }

  setSession(res, "viewer", "/");
}

async function handleAdminLogin(req, res) {
  const body = await readBody(req, 20_000);
  const params = new URLSearchParams(body);
  if (params.get("password") !== ADMIN_PASSWORD) {
    return redirect(res, "/admin?error=1");
  }

  setSession(res, "admin", "/");
}

function setSession(res, role, location) {
  const token = role === "admin" ? sessionToken("admin", ADMIN_PASSWORD) : sessionToken("viewer", FAMILY_PASSWORD);
  res.writeHead(303, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
    Location: location
  });
  res.end();
}

async function handleUpload(req, res) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return json(res, 400, { error: "multipart_required" });

  const body = await readBody(req, 1_500_000_000, "binary");
  const parsed = parseMultipart(Buffer.from(body, "binary"), match[1] || match[2]);
  const title = (parsed.fields.title || "").trim() || "제목 없는 영상";
  const description = (parsed.fields.description || "").trim();
  const thumbnailData = (parsed.fields.thumbnailData || "").trim();
  const file = parsed.files.video;

  if (!file || !file.filename) return json(res, 400, { error: "video_required" });
  if (!file.contentType.startsWith("video/")) return json(res, 400, { error: "video_only" });

  const id = crypto.randomUUID();
  const ext = safeVideoExtension(file.filename, file.contentType);
  const videoName = `${id}${ext}`;
  const thumbName = `${id}.jpg`;
  const videoPath = path.join(VIDEO_DIR, videoName);
  const thumbPath = path.join(THUMB_DIR, thumbName);

  await fs.writeFile(videoPath, file.data);
  const uploadedThumbnail = await saveUploadedThumbnail(thumbnailData, thumbPath);
  const thumbnailCreated = uploadedThumbnail || await createThumbnail(videoPath, thumbPath);

  const videos = await listVideos();
  videos.push({
    id,
    title,
    description,
    originalName: file.filename,
    videoUrl: `/media/videos/${videoName}`,
    thumbUrl: thumbnailCreated ? `/media/thumbnails/${thumbName}` : "/public/placeholder.svg",
    createdAt: new Date().toISOString(),
    size: file.data.length
  });
  await saveVideos(videos);

  redirect(res, `/watch?id=${id}`);
}

async function handleDeleteVideo(req, res, id) {
  const videos = await listVideos();
  const target = videos.find((video) => video.id === id);
  if (!target) return json(res, 404, { error: "video_not_found" });

  await Promise.all([
    deleteMediaFile(target.videoUrl),
    deleteMediaFile(target.thumbUrl)
  ]);
  await saveVideos(videos.filter((video) => video.id !== id));

  json(res, 200, { ok: true });
}

function isAllowed(req) {
  return getSessionRole(req) !== "guest";
}

function isAdmin(req) {
  return getSessionRole(req) === "admin";
}

function getSessionRole(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token === sessionToken("admin", ADMIN_PASSWORD)) return "admin";
  if (token === sessionToken("viewer", FAMILY_PASSWORD)) return "viewer";
  return "guest";
}

function sessionToken(role, password) {
  return crypto.createHash("sha256").update(`${role}:${password}`).digest("hex");
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

async function readBody(req, maxBytes, encoding = "utf8") {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return encoding === "binary" ? buffer.toString("binary") : buffer.toString("utf8");
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = {};
  const marker = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, marker).slice(1, -1);

  for (const part of parts) {
    const cleanPart = trimCrlf(part);
    const headerEnd = cleanPart.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headerText = cleanPart.slice(0, headerEnd).toString("utf8");
    const data = cleanPart.slice(headerEnd + 4);
    const name = headerText.match(/name="([^"]+)"/)?.[1];
    const filename = headerText.match(/filename="([^"]*)"/)?.[1];
    const contentType = headerText.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    if (!name) continue;

    if (filename !== undefined) {
      files[name] = { filename: path.basename(filename), contentType, data };
    } else {
      fields[name] = data.toString("utf8");
    }
  }

  return { fields, files };
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

function trimCrlf(buffer) {
  let start = 0;
  let end = buffer.length;
  while (buffer[start] === 13 || buffer[start] === 10) start += 1;
  while (buffer[end - 1] === 13 || buffer[end - 1] === 10) end -= 1;
  return buffer.slice(start, end);
}

function safeVideoExtension(filename, contentType) {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".webm", ".mov"].includes(ext)) return ext;
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("quicktime")) return ".mov";
  return ".mp4";
}

async function createThumbnail(videoPath, thumbPath) {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-ss",
      "00:00:02",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-1",
      thumbPath
    ]);

    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("close", (code) => resolve(code === 0));
  });
}

async function saveUploadedThumbnail(dataUrl, thumbPath) {
  const match = dataUrl.match(/^data:image\/jpeg;base64,([a-z0-9+/=]+)$/i);
  if (!match) return false;

  try {
    await fs.writeFile(thumbPath, Buffer.from(match[1], "base64"));
    return true;
  } catch {
    return false;
  }
}

async function deleteMediaFile(urlPath) {
  if (!urlPath?.startsWith("/media/")) return;
  const relativePath = urlPath.replace("/media/", "");
  const resolved = path.normalize(path.join(MEDIA_DIR, relativePath));
  if (!resolved.startsWith(MEDIA_DIR)) return;

  try {
    await fs.unlink(resolved);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function serveStatic(res, root, relativePath, allowRange = false, req = null) {
  const resolved = path.normalize(path.join(root, relativePath));
  if (!resolved.startsWith(root)) return notFound(res);
  return serveFile(res, resolved, allowRange, req);
}

async function serveFile(res, filePath, allowRange = false, req = null) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return notFound(res);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (allowRange && req?.headers.range) {
      const range = req.headers.range.match(/bytes=(\d*)-(\d*)/);
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Number(range[2]) : stat.size - 1;
        res.writeHead(206, {
          "Content-Type": contentType,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes"
        });
        return pipeFile(filePath, res, { start, end });
      }
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Accept-Ranges": allowRange ? "bytes" : "none"
    });
    pipeFile(filePath, res);
  } catch {
    notFound(res);
  }
}

function pipeFile(filePath, res, options = {}) {
  const stream = createReadStream(filePath, options);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("File stream error");
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}
