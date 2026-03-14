# 🎮 Party Games — Local Jackbox-style Framework

A fully local, self-hosted party game server. Plug your PC into a TV via HDMI, run the server, and players join from their phones on the same WiFi.

The current version of the game is fully vibe-coded to get a quick MVP, but I intend to improve the current implementation in the future.

## Quick Start

```bash
npm install
npm start
```

- **TV / Host:** `http://localhost:3000/host`
- **Players:** scan the QR on screen or go to `http://<YOUR_IP>:3000/player`

---

## Adding a New Game

Just create a new folder in `/games/` — it's auto-discovered on startup:

```
games/
└── mygame/
    ├── game.js       ← server logic (required)
    ├── host.html     ← host UI fragment (required)
    ├── host.js       ← host UI logic (required)
    ├── player.html   ← player UI fragment (required)
    ├── player.js     ← player UI logic (required)
    └── anything.png  ← any assets, served at /games/mygame/
```

**No other files need to be touched.** The shell loads your game's HTML/JS automatically when the host starts it.

---

### game.js contract

```js
module.exports = {
  id:         "mygame",
  name:       "🎯 My Game",
  minPlayers: 2,
  maxPlayers: 8,

  // Called once when host starts the game
  start({ io, players, endGame }) {},

  // Called on any player:action event from a player
  onPlayerAction({ socket, player, payload, io, players, endGame }) {},

  // Called on any host:action event from the host
  onHostAction({ socket, payload, io, players, endGame }) {},

  // Optional: called when returning to lobby (cleanup timers etc.)
  onEnd({ io, players }) {},

  // Optional: called when a new player joins mid-game
  onPlayerJoin({ socket, player, io, players, endGame }) {},
};
```

### host.js / player.js

`socket` is already connected and available as a global — just use it:

```js
// host.js or player.js
socket.on("mygame:something", (data) => {
  // update the DOM from your html fragment
});
```

### Showing a contextual button on the host screen

From your `game.js`, emit these to give the host a dynamic action button:

```js
io.to("host").emit("host:show_action", { label: "⏭ Skip", type: "skip" });
io.to("host").emit("host:hide_action");
```

When clicked, the host shell fires `host:action` with `{ type: "skip" }` back to the server, which routes it to your `onHostAction`.

---

## Socket Event Reference

### Framework → All
| Event | Payload | When |
|---|---|---|
| `lobby:update` | `{ players, games }` | Player joins/leaves |
| `game:start` | `{ gameId, gameName }` | Host starts a game |
| `game:end` | `{}` | Game ends / host force-ends |

### Framework → Host only
| Event | Payload | When |
|---|---|---|
| `host:init` | `{ players, games }` | Host connects |
| `host:error` | string | e.g. not enough players |
| `host:show_action` | `{ label, type }` | Game wants a button shown |
| `host:hide_action` | — | Game wants button removed |

### Host → Framework
| Event | Payload |
|---|---|
| `host:connect` | — |
| `host:start_game` | `{ gameId }` |
| `host:end_game` | — |
| `host:action` | `{ type, ...any }` |

### Player → Framework
| Event | Payload |
|---|---|
| `player:join` | `{ name }` |
| `player:action` | `{ type, ...any }` |