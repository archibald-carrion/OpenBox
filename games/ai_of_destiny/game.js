/**
 * GAME: AI of Destiny
 * -------------------
 * Players respond to situations; an AI judges if they live or die.
 * 5 rounds, survive = 1 pt, most points wins.
 *
 * Config (process.env):
 *   AI_OF_DESTINY_PROVIDER   - "openai" | "anthropic" | "ollama" (default: ollama)
 *   AI_OF_DESTINY_MODEL      - e.g. gpt-4o-mini, claude-3-haiku, llama3.2:3b
 *   OPENAI_API_KEY           - required when provider=openai
 *   ANTHROPIC_API_KEY        - required when provider=anthropic
 *   AI_OF_DESTINY_OLLAMA_URL - optional; default http://localhost:11434
 *   (Legacy: DEATH_BY_AI_* still read as fallback if AI_OF_DESTINY_* unset.)
 */

const SITUATIONS = require("./assets/situations.json");
const ANSWER_TIME = 45;

const PROVIDER = (
  process.env.AI_OF_DESTINY_PROVIDER || process.env.DEATH_BY_AI_PROVIDER || "ollama"
).toLowerCase();
const MODEL =
  process.env.AI_OF_DESTINY_MODEL ||
  process.env.DEATH_BY_AI_MODEL ||
  (PROVIDER === "ollama" ? "llama3.2:3b" : "gpt-4o-mini");
const OLLAMA_URL =
  process.env.AI_OF_DESTINY_OLLAMA_URL ||
  process.env.DEATH_BY_AI_OLLAMA_URL ||
  "http://localhost:11434";

let state = {};
let _endGame = null;

const game = {
  id: "ai_of_destiny",
  name: "🔮 AI of Destiny",
  minPlayers: 2,
  maxPlayers: 12,

  start({ io, players, endGame }) {
    _endGame = endGame;
    const playerIds = Object.keys(players);
    const situations = [...SITUATIONS].sort(() => Math.random() - 0.5).slice(0, 5);

    state = {
      io,
      players,
      situations,
      round: 0,
      phase: "waiting",
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      responses: {},
      results: {},
      readyPlayers: new Set(),
      timer: null,
    };
  },

  onHostReady({ hostSocket }) {
    if (state.phase === "writing") {
      game._sendSituationTo(hostSocket);
      hostSocket.emit("host:show_action", { label: "⏭ Skip", type: "skip" });
    }
    if (state.phase === "reveal") {
      hostSocket.emit("aod:reveal", {
        round: state.round,
        totalRounds: 5,
        results: game._formatResults(),
        scores: game._scoreBoard(),
      });
    }
  },

  onPlayerReady({ socket }) {
    state.readyPlayers.add(socket.id);
    const total = Object.keys(state.players).length;
    if (state.readyPlayers.size >= total && state.phase === "waiting") {
      state.phase = "writing";
      game._startRound();
    }
    if (state.phase === "writing") {
      game._sendSituationTo(socket);
    }
    if (state.phase === "reveal" && state.results[socket.id] !== undefined) {
      socket.emit("aod:reveal_player", {
        survived: state.results[socket.id],
        yourResponse: (state.responses[socket.id] || "...").trim(),
        reasoning: state.reasons?.[socket.id] ?? "",
        scores: game._scoreBoard(),
      });
    }
  },

  _startRound() {
    state.round++;
    state.responses = {};
    state.results = {};
    const situation = state.situations[state.round - 1];

    state.io.emit("aod:situation", {
      round: state.round,
      totalRounds: 5,
      situation,
      timeLimit: ANSWER_TIME,
    });
    state.io.to("host").emit("host:show_action", { label: "⏭ Skip", type: "skip" });

    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._judgeAll(), ANSWER_TIME * 1000);
  },

  _sendSituationTo(target) {
    const situation = state.situations[state.round - 1];
    target.emit("aod:situation", {
      round: state.round,
      totalRounds: 5,
      situation,
      timeLimit: ANSWER_TIME,
    });
    if (Object.keys(state.responses).length > 0) {
      target.emit("aod:progress", {
        answered: Object.keys(state.responses).length,
        total: Object.keys(state.players).length,
      });
    }
  },

  _judgeAll() {
    clearTimeout(state.timer);
    state.io.to("host").emit("host:hide_action");
    state.phase = "judging";

    const situation = state.situations[state.round - 1];
    const playerIds = Object.keys(state.players);
    state.reasons = {};
    const promises = playerIds.map(async (id) => {
      const response = (state.responses[id] || "...").trim();
      const result = await game._callAI(situation, response, state.players[id].name);
      return { id, survived: result.survived, reasoning: result.reasoning };
    });

    Promise.all(promises).then((judgments) => {
      for (const { id, survived, reasoning } of judgments) {
        state.results[id] = survived;
        state.reasons[id] = reasoning;
        if (survived) state.scores[id] = (state.scores[id] || 0) + 1;
      }
      state.phase = "reveal";
      game._emitReveal();
    });
  },

  async _callAI(situation, response, playerName) {
    const prompt = `You are a playful judge for a silly party game. Be lenient and fun! Use imagination and fantasy — creative or funny answers should often survive. Don't be cruel or overly realistic; reward cleverness and humor. It's a lighthearted game, not a strict simulation.

Situation: ${situation}
Player "${playerName}" responded: ${response}

Does the player survive or die? Be generous and entertaining.
Reply in this format:
VERDICT: true
REASON: A short, fun sentence explaining your judgment (can be silly or dramatic).`;

    try {
      if (PROVIDER === "openai") {
        const key = process.env.OPENAI_API_KEY;
        if (!key) {
          console.warn("[AI of Destiny] OPENAI_API_KEY not set, defaulting to survived");
          return { survived: true, reasoning: "API key not configured." };
        }
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
          }),
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || "";
        return game._parseAIResponse(text);
      }

      if (PROVIDER === "anthropic") {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) {
          console.warn("[AI of Destiny] ANTHROPIC_API_KEY not set, defaulting to survived");
          return { survived: true, reasoning: "API key not configured." };
        }
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 150,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        const text = data.content?.[0]?.text?.trim() || "";
        return game._parseAIResponse(text);
      }

      // Ollama
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          stream: false,
          options: { num_predict: 150 },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || res.statusText;
        console.warn(`[AI of Destiny] Ollama error (${res.status}):`, errMsg);
        if (/not found|model.*not found/i.test(String(errMsg))) {
          console.warn(`[AI of Destiny] Run: ollama pull ${MODEL}`);
        }
        return { survived: true, reasoning: `Ollama unavailable: ${errMsg}` };
      }
      const text = (data.response || "").trim();
      return game._parseAIResponse(text);
    } catch (err) {
      console.warn("[AI of Destiny] AI call failed:", err.message);
      return { survived: true, reasoning: `Error: ${err.message}` };
    }
  },

  _parseAIResponse(text) {
    const survived = /\btrue\b/i.test(text);
    const reasonMatch = text.match(/REASON:\s*(.+?)(?:\n|$)/i) || text.match(/reason[:\s]+(.+?)(?:\n|$)/i);
    const reasoning = (reasonMatch ? reasonMatch[1].trim() : text).substring(0, 300) || (survived ? "The judge spared you." : "The judge was not impressed.");
    return { survived, reasoning };
  },

  _formatResults() {
    return Object.entries(state.results).map(([id, survived]) => ({
      name: state.players[id]?.name ?? "?",
      response: (state.responses[id] || "...").trim(),
      survived,
      reasoning: state.reasons?.[id] ?? "",
    }));
  },

  _scoreBoard() {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: state.players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  _emitReveal() {
    const formatted = game._formatResults();
    state.io.to("host").emit("aod:reveal", {
      round: state.round,
      totalRounds: 5,
      results: formatted,
      scores: game._scoreBoard(),
    });
    Object.keys(state.players).forEach((id) => {
      state.players[id].socket.emit("aod:reveal_player", {
        survived: state.results[id],
        yourResponse: (state.responses[id] || "...").trim(),
        reasoning: state.reasons?.[id] ?? "",
        scores: game._scoreBoard(),
      });
    });

    const nextLabel = state.round < 5 ? "Next round" : "Show final scores";
    state.io.to("host").emit("host:show_action", { label: `⏭ ${nextLabel}`, type: "next" });
  },

  _advanceFromReveal() {
    state.io.to("host").emit("host:hide_action");
    if (state.round < 5) {
      state.phase = "writing";
      game._startRound();
    } else {
      state.io.to("host").emit("aod:gameover", { scores: game._scoreBoard() });
      state.io.emit("aod:gameover_player", { scores: game._scoreBoard() });
      state.io.to("host").emit("host:show_action", { label: "🚪 Back to lobby", type: "end" });
    }
  },

  onPlayerAction({ socket, payload }) {
    if (payload.type !== "answer" || state.phase !== "writing" || state.responses[socket.id]) return;
    state.responses[socket.id] = (payload.text || "").trim().substring(0, 400) || "...";
    socket.emit("aod:answer_ack");

    const answered = Object.keys(state.responses).length;
    const total = Object.keys(state.players).length;
    state.io.to("host").emit("aod:progress", { answered, total });

    if (answered >= total) {
      clearTimeout(state.timer);
      game._judgeAll();
    }
  },

  onHostAction({ payload }) {
    if (payload.type === "skip" && state.phase === "writing") {
      clearTimeout(state.timer);
      game._judgeAll();
    }
    if (payload.type === "next" && state.phase === "reveal") {
      game._advanceFromReveal();
    }
    if (payload.type === "end") {
      _endGame();
    }
  },

  onEnd() {
    clearTimeout(state.timer);
    state = {};
    _endGame = null;
  },
};

module.exports = game;
