import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || "0000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "9999";
const SESSION_COOKIE = "familytube_session";
const MEDIA_DIR = path.join(__dirname, "media");
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

    if (req.method === "POST" && url.pathname === "/api/drive-videos") {
      if (!isAdmin(req)) return json(res, 403, { error: "admin_required" });
      return handleCreateDriveVideo(req, res);
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/videos/")) {
      if (!isAdmin(req)) return json(res, 403, { error: "admin_required" });
      return handleUpdateVideo(req, res, decodeURIComponent(url.pathname.replace("/api/videos/", "")));
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
  await fs.mkdir(MEDIA_DIR, { recursive: true });
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

async function handleCreateDriveVideo(req, res) {
  const body = await readBody(req, 100_000);
  const params = new URLSearchParams(body);
  const title = (params.get("title") || "").trim() || "제목 없는 영상";
  const description = (params.get("description") || "").trim();
  const recordedDate = normalizeDate(params.get("recordedDate") || "");
  const driveUrl = (params.get("driveUrl") || "").trim();
  const driveId = extractGoogleDriveFileId(driveUrl);

  if (!driveId) return redirect(res, "/?driveError=1");

  const id = crypto.randomUUID();
  const videos = await listVideos();
  videos.push({
    id,
    title,
    description,
    recordedDate,
    originalName: "Google Drive",
    sourceType: "googleDrive",
    driveFileId: driveId,
    driveUrl,
    videoUrl: `https://drive.google.com/file/d/${driveId}/preview`,
    thumbUrl: `https://drive.google.com/thumbnail?id=${driveId}&sz=w640`,
    createdAt: new Date().toISOString(),
    size: 0
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

async function handleUpdateVideo(req, res, id) {
  const videos = await listVideos();
  const index = videos.findIndex((video) => video.id === id);
  if (index === -1) return json(res, 404, { error: "video_not_found" });

  const body = JSON.parse(await readBody(req, 100_000));
  const title = String(body.title || "").trim();
  if (!title) return json(res, 400, { error: "title_required" });

  const nextVideo = {
    ...videos[index],
    title,
    description: String(body.description || "").trim(),
    recordedDate: normalizeDate(body.recordedDate || "")
  };

  if (nextVideo.sourceType === "googleDrive" && body.driveUrl !== undefined) {
    const driveUrl = String(body.driveUrl || "").trim();
    const driveId = extractGoogleDriveFileId(driveUrl);
    if (!driveId) return json(res, 400, { error: "drive_url_required" });
    nextVideo.driveFileId = driveId;
    nextVideo.driveUrl = driveUrl;
    nextVideo.videoUrl = `https://drive.google.com/file/d/${driveId}/preview`;
    nextVideo.thumbUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w640`;
  }

  videos[index] = nextVideo;
  await saveVideos(videos);
  json(res, 200, videos[index]);
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

function normalizeDate(value) {
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return Number.isNaN(new Date(`${date}T00:00:00`).getTime()) ? "" : date;
}

function extractGoogleDriveFileId(value) {
  try {
    const url = new URL(value);
    if (!url.hostname.includes("drive.google.com")) return "";

    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (pathMatch) return sanitizeDriveId(pathMatch[1]);

    const id = url.searchParams.get("id");
    if (id) return sanitizeDriveId(id);
  } catch {
    return "";
  }

  return "";
}

function sanitizeDriveId(value) {
  return /^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : "";
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
