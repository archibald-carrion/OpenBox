const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const GameManager = require("./GameManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;
app.get("/api/ip", (_, res) => res.json({ ip: getLocalIP() }));

// ─── Static files ────────────────────────────────────────────────────────────
app.use("/shared", express.static(path.join(__dirname, "public/shared")));
app.use("/host",   express.static(path.join(__dirname, "public/host")));
app.use("/player", express.static(path.join(__dirname, "public/player")));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get("/",        (_, res) => res.redirect("/host"));
app.get("/host",    (_, res) => res.sendFile(path.join(__dirname, "public/host/index.html")));
app.get("/player",  (_, res) => res.sendFile(path.join(__dirname, "public/player/index.html")));
app.get("/qr",      async (req, res) => {
  const url = req.query.url;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

// ─── Game Manager ─────────────────────────────────────────────────────────────
const gm = new GameManager(io);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  // Host connects
  socket.on("host:connect", () => {
    socket.join("host");
    gm.onHostConnect(socket);
  });

  // Player joins lobby
  socket.on("player:join", ({ name }) => {
    gm.onPlayerJoin(socket, name);
  });

  // Host starts a specific game
  socket.on("host:start_game", ({ gameId }) => {
    gm.startGame(gameId);
  });

  // Host goes back to lobby
  socket.on("host:end_game", () => {
    gm.endGame();
  });

  // Generic game action from player
  socket.on("player:action", (payload) => {
    gm.onPlayerAction(socket, payload);
  });

  // Generic game action from host (e.g. advance round)
  socket.on("host:action", (payload) => {
    gm.onHostAction(socket, payload);
  });

  socket.on("disconnect", () => {
    gm.onDisconnect(socket);
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("\n🎮  Party Games Server running!");
  console.log(`\n   HOST (TV):   http://localhost:${PORT}/host`);
  console.log(`   PLAYERS:     http://${ip}:${PORT}/player`);
  console.log(`\n   Share the PLAYER url with everyone on the same WiFi.\n`);
});
