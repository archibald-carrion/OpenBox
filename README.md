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

For detailed, step-by-step instructions on building a new game (folder structure, lifecycle hooks, socket event patterns, and best practices), see the full game developer guide:

- **[`game_developer_guide.md`](game_developer_guide.md)**

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


## TODO
This new section covers **some things which needs checking/improving** in the codebase, framework, games, and documentation. Since it's a vibe-coded MVP, I organized it into logical categories with specific, actionable items:

### 📋 Categories Included
- **🔧 Framework/Core Issues** — Error handling, race conditions, security, performance
- **🎮 Game-Specific Issues** — Trivia, Draw & Guess, Prompt War improvements
- **🛠️ Developer Experience** — Code quality, testing, documentation
- **🎨 UI/UX Issues** — Host/player interfaces, accessibility, responsiveness
- **🚀 Deployment & Operations** — Production readiness, platform support
- **🧪 Testing & Quality Assurance** — Automated and manual testing
- **📊 Analytics & Metrics** — Usage tracking and business intelligence
- Check what additional thing could be abstracted by the host and not managed by the game

### 🎯 Key Highlights
- **Prioritized by impact** — Critical issues (error handling, security) first
- **Realistic scope** — Covers both quick wins and major overhauls
- **Comprehensive but not overwhelming** — Each item is specific and actionable
- **MVP-appropriate** — Acknowledges this is early-stage code that needs polish
