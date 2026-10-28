// Entry point for hosts that only run "node index.js" (Katabump, Pterodactyl...).
// Loads .env when present (otherwise the host's environment variables are used), then runs the TypeScript bot through tsx.
import fs from "node:fs";
import { register } from "tsx/esm/api";

if (fs.existsSync(new URL("./.env", import.meta.url))) process.loadEnvFile(new URL("./.env", import.meta.url));

register();
await import("./src/index.ts");
