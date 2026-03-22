const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");
const os      = require("os");
const QRCode  = require("qrcode");
const jwt     = require("jsonwebtoken");

const GameManager = require("./GameManager");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,  // 60 seconds
  pingInterval: 25000  // 25 seconds
});
const PORT   = 3000;
const JWT_SECRET = "openbox-secret-key"; // In production, use environment variable

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

// ── JWT token generation for persistent sessions ───────────────────────────
app.post("/api/auth/token", express.json(), (req, res) => {
  const { playerId, name } = req.body;
  if (!playerId || !name) {
    return res.status(400).json({ error: "playerId and name required" });
  }

  const token = jwt.sign({ playerId, name }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token });
});

// ── JWT token validation middleware ─────────────────────────────────────────
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

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
  socket.on("player:join",     (data)       => gm.onPlayerJoin(socket, data));
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