// Healthcheck container API: tanya /health lewat socket Unix (tanpa port).
import http from "node:http";

const socketPath = process.env.AUTOEDIT_SOCKET || "/run/autoedit/api.sock";
const req = http.get({ socketPath, path: "/health", timeout: 5000 }, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("timeout", () => req.destroy());
req.on("error", () => process.exit(1));
