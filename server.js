const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");
const os      = require("os");
const QRCode  = require("qrcode");

const GameManager = require("./GameManager");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = 3000;

// ── Static shell UIs ─────────────────────────────────────────────────────────
app.use("/host",   express.static(path.join(__dirname, "public/host")));
app.use("/player", express.static(path.join(__dirname, "public/player")));

// ── QR helper ────────────────────────────────────────────────────────────────
app.get("/qr", async (req, res) => {
  const svg = await QRCode.toString(req.query.url, { type: "svg", margin: 1 });
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

// ── Expose server IP to the host shell ───────────────────────────────────────
app.get("/api/ip", (_, res) => res.json({ ip: getLocalIP() }));

// ── Redirects ────────────────────────────────────────────────────────────────
app.get("/",       (_, res) => res.redirect("/host"));
app.get("/host",   (_, res) => res.sendFile(path.join(__dirname, "public/host/index.html")));
app.get("/player", (_, res) => res.sendFile(path.join(__dirname, "public/player/index.html")));

// ── Game Manager (also registers /games/:id static routes) ───────────────────
const gm = new GameManager(io, app);

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("host:connect",    ()           => gm.onHostConnect(socket));
  socket.on("host:ready",      ()           => gm.onHostReady(socket));
  socket.on("player:join",     ({ name })   => gm.onPlayerJoin(socket, name));
  socket.on("host:start_game", ({ gameId }) => gm.startGame(gameId));
  socket.on("host:end_game",   ()           => gm.endGame());
  socket.on("player:action",   (payload)   => gm.onPlayerAction(socket, payload));
  socket.on("player:ready",    ()           => gm.onPlayerReady(socket));
  socket.on("host:action",     (payload)   => gm.onHostAction(socket, payload));
  socket.on("disconnect",      ()           => gm.onDisconnect(socket));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (/loopback|vethernet|virtualbox|vmware|wsl|vpn|tap|tun/i.test(name)) continue;
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("\n🎮  OpenBox running!");
  console.log(`\n   HOST (TV):  http://localhost:${PORT}/host`);
  console.log(`   PLAYERS:    http://${ip}:${PORT}/player`);
  console.log(`\n   Share the PLAYER url with everyone on the same WiFi.\n`);
});