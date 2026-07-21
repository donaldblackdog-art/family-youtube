import crypto from "node:crypto";
import fs from "node:fs/promises";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node tools/encrypt-videos.mjs <password>");
  process.exit(1);
}

const inputPath = new URL("../videos.private.json", import.meta.url);
const outputPath = new URL("../videos.js", import.meta.url);
const iterations = 210000;
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const plaintext = await fs.readFile(inputPath, "utf8");
JSON.parse(plaintext);

const encrypted = Buffer.concat([
  cipher.update(plaintext, "utf8"),
  cipher.final()
]);
const tag = cipher.getAuthTag();
const payload = Buffer.concat([encrypted, tag]);

const output = `window.CHOCHO_ENCRYPTED_VIDEOS = ${JSON.stringify({
  version: 1,
  algorithm: "AES-GCM",
  kdf: "PBKDF2-SHA256",
  iterations,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  data: payload.toString("base64")
}, null, 2)};\n`;

await fs.writeFile(outputPath, output);
console.log("Encrypted videos.js has been updated.");
