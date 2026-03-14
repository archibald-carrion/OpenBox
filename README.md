# 🎮 Party Games — Local Jackbox-style Framework

A fully local, self-hosted party game server. Plug your PC into a TV via HDMI, run the server, and players join from their phones on the same WiFi.

The current version of the game is fully vibe-coded to get a quick MVP, but I intend to improve the current implementation in the future.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies (once)
npm install

# 2. Start the server
npm start
```

Then:
- **TV / Host screen** → `http://localhost:3000/host`
- **Players** scan the QR code shown on screen, or go to `http://<YOUR_IP>:3000/player`

---

## 📦 Included Games

| Game | Players | Description |
|------|---------|-------------|
| ⚡ Quick Trivia | 1–16 | Answer 6 multiple-choice questions, speed = more points |
| 🎨 Draw & Guess | 2–10 | Take turns drawing a secret word while others guess |

---

## ➕ Adding a New Game

Create a file in `/games/your_game.js` — it just needs to export this shape:

```js
module.exports = {
  id:         "your_game",        // unique string key
  name:       "🎯 Your Game",     // shown in the lobby
  minPlayers: 2,
  maxPlayers: 8,

  // Called once when the host starts this game
  start({ io, players, endGame }) {
    // io      → Socket.IO server instance (broadcast with io.emit / io.to("host").emit)
    // players → { [socketId]: { id, name, socket } }
    // endGame → call this to return to lobby
  },

  // Called when any player sends a "player:action" event
  onPlayerAction({ socket, player, payload, io, players, endGame }) {
    // payload is whatever the player's browser sent
  },

  // Called when the host sends a "host:action" event
  onHostAction({ socket, payload, io, players, endGame }) {
    // e.g. { type: "skip" } to advance
  },

  // Optional: called when a player joins mid-game
  onPlayerJoin({ socket, player, io, players, endGame }) {},
};
```

The game file is **auto-loaded** on server start — no registration needed.

---

## 🧩 Socket Event Reference

### Server → All clients
| Event | Payload | Description |
|-------|---------|-------------|
| `lobby:update` | `{ players, games }` | Player list or game list changed |
| `game:start` | `{ gameId, gameName }` | A game just started |
| `game:end` | `{}` | Game ended, back to lobby |

### Server → Host only (`io.to("host")`)
| Event | Payload | Description |
|-------|---------|-------------|
| `host:init` | `{ players, games }` | Initial state on connection |
| `host:error` | string | e.g. "not enough players" |

### Client (Host) → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `host:connect` | — | Register as host |
| `host:start_game` | `{ gameId }` | Start a game |
| `host:end_game` | — | Force return to lobby |
| `host:action` | any | Game-specific host action |

### Client (Player) → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `player:join` | `{ name }` | Join the lobby |
| `player:action` | any | Game-specific player action |

---

## 🗂 Project Structure

```
partygames/
├── server.js          ← Entry point (Express + Socket.IO)
├── GameManager.js     ← Lobby, player management, game routing
├── games/
│   ├── trivia.js      ← Quick Trivia game
│   └── drawguess.js   ← Draw & Guess game
└── public/
    ├── host/          ← TV display (index.html)
    └── player/        ← Mobile player UI (index.html)
```
