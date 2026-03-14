/**
 * GAME: Draw & Guess
 * ──────────────────
 * One player draws a secret word on their phone.
 * Everyone else guesses what it is.
 * Points for correct guesses + drawing fooling people.
 *
 * Rounds: each player gets to draw once.
 */

const WORDS = [
  "pizza","rainbow","dinosaur","rocket","ninja","volcano",
  "submarine","haunted house","time machine","invisible man",
  "spaghetti","tornado","pirate","robot","treasure chest",
  "black hole","unicorn","quicksand","thunderstorm","disco",
];

let state = {};

module.exports = {
  id: "drawguess",
  name: "🎨 Draw & Guess",
  minPlayers: 2,
  maxPlayers: 10,

  start({ io, players, endGame }) {
    const playerIds = Object.keys(players);
    state = {
      players,
      drawOrder: [...playerIds].sort(() => Math.random() - 0.5),
      currentDrawerIndex: 0,
      scores: Object.fromEntries(playerIds.map(id => [id, 0])),
      phase: "drawing",   // drawing | guessing | reveal
      word: null,
      guesses: {},        // socketId -> string
      strokes: [],        // drawing strokes for host display
      timer: null,
      endGame,
      io,
    };
    this._nextRound(io, players);
  },

  _nextRound(io, players) {
    if (state.currentDrawerIndex >= state.drawOrder.length) {
      // Game over
      io.emit("drawguess:gameover", { scores: this._scoreBoard(players) });
      setTimeout(() => state.endGame(), 8000);
      return;
    }

    const drawerId = state.drawOrder[state.currentDrawerIndex];
    const drawer   = players[drawerId];
    state.word     = WORDS[Math.floor(Math.random() * WORDS.length)];
    state.guesses  = {};
    state.strokes  = [];
    state.phase    = "drawing";

    // Tell host who is drawing
    io.to("host").emit("drawguess:round_start", {
      drawerName: drawer?.name ?? "?",
      round: state.currentDrawerIndex + 1,
      total: state.drawOrder.length,
    });

    // Tell drawer their word privately
    const drawerSocket = players[drawerId]?.socket;
    if (drawerSocket) {
      drawerSocket.emit("drawguess:you_draw", { word: state.word });
    }

    // Tell everyone else they're guessing
    Object.entries(players).forEach(([id, p]) => {
      if (id !== drawerId) {
        p.socket.emit("drawguess:guess_phase", {
          drawerName: drawer?.name ?? "?",
        });
      }
    });

    // 60 second drawing timer
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this._endRound(io, players), 60000);
  },

  _endRound(io, players) {
    clearTimeout(state.timer);
    state.phase = "reveal";

    const drawerId = state.drawOrder[state.currentDrawerIndex];

    // Score guesses
    const correct = [];
    Object.entries(state.guesses).forEach(([id, guess]) => {
      if (guess.trim().toLowerCase() === state.word.toLowerCase()) {
        state.scores[id] = (state.scores[id] || 0) + 500;
        state.scores[drawerId] = (state.scores[drawerId] || 0) + 200; // drawer bonus
        correct.push(players[id]?.name ?? "?");
      }
    });

    io.emit("drawguess:reveal", {
      word:    state.word,
      correct,
      guesses: Object.entries(state.guesses).map(([id, g]) => ({
        name: players[id]?.name ?? "?",
        guess: g,
      })),
      scores: this._scoreBoard(players),
    });

    state.currentDrawerIndex++;
    state.timer = setTimeout(() => this._nextRound(io, players), 6000);
  },

  _scoreBoard(players) {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  onPlayerAction({ socket, player, payload, io, players }) {
    const drawerId = state.drawOrder[state.currentDrawerIndex];

    if (payload.type === "stroke" && socket.id === drawerId) {
      // Forward drawing strokes to host in real-time
      state.strokes.push(payload.stroke);
      io.to("host").emit("drawguess:stroke", { stroke: payload.stroke });
      return;
    }

    if (payload.type === "clear" && socket.id === drawerId) {
      state.strokes = [];
      io.to("host").emit("drawguess:clear");
      return;
    }

    if (payload.type === "guess" && socket.id !== drawerId && state.phase === "drawing") {
      state.guesses[socket.id] = payload.text;
      socket.emit("drawguess:guess_ack");
      // Don't reveal correct/wrong until end (to prevent spoilers)
    }
  },

  onHostAction({ payload, io, players }) {
    if (payload.type === "skip") {
      this._endRound(io, players);
    }
  },
};
