/**
 * GAME: The Chameleon
 * ───────────────────
 * One player is secretly the Chameleon and doesn't know the secret word.
 * Everyone gives one clue. Players vote on who the Chameleon is.
 * If caught, the Chameleon gets one last chance to guess the word.
 *
 * Phases: grid_pick → clue → vote → reveal → chameleon_guess → result
 */

const GRIDS = {
  "Animals": [
    "Lion","Tiger","Bear","Wolf","Fox","Rabbit",
    "Eagle","Shark","Dolphin","Crocodile","Gorilla","Penguin",
    "Cobra","Cheetah","Elephant","Parrot","Hippo","Kangaroo",
    "Scorpion","Panda","Octopus","Leopard","Hyena","Flamingo",
  ],
  "Foods": [
    "Pizza","Sushi","Burger","Tacos","Pasta","Ramen",
    "Steak","Curry","Falafel","Crepe","Paella","Dumpling",
    "Waffle","Kebab","Nachos","Risotto","Pho","Gyoza",
    "Fondue","Pierogi","Empanada","Biryani","Moussaka","Tiramisu",
  ],
  "Sports": [
    "Football","Basketball","Tennis","Swimming","Boxing","Cycling",
    "Skiing","Volleyball","Rugby","Golf","Surfing","Archery",
    "Wrestling","Fencing","Rowing","Climbing","Judo","Polo",
    "Curling","Bobsled","Skateboard","Darts","Snooker","Squash",
  ],
  "Movies": [
    "Titanic","Matrix","Inception","Jaws","Alien","Rocky",
    "Grease","Psycho","Shining","Gladiator","Joker","Avatar",
    "Casablanca","Scarface","Braveheart","Goodfellas","Parasite","Dunkirk",
    "Interstellar","Spotlight","Moonlight","Whiplash","Hereditary","Midsommar",
  ],
  "Places": [
    "Paris","Tokyo","Cairo","Sydney","Rome","Moscow",
    "London","Dubai","Mumbai","Berlin","Toronto","Nairobi",
    "Bangkok","Lima","Lagos","Seoul","Vienna","Athens",
    "Havana","Oslo","Istanbul","Lisbon","Bogota","Reykjavik",
  ],
  "Jobs": [
    "Doctor","Pilot","Chef","Lawyer","Teacher","Soldier",
    "Actor","Farmer","Miner","Sailor","Dancer","Banker",
    "Hacker","Monk","Jockey","Clown","Barber","Magician",
    "Plumber","Fireman","Astronaut","Butcher","Judge","Spy",
  ],
};

let state = {};

const game = {
  id:         "chameleon",
  name:       "🦎 The Chameleon",
  minPlayers: 3,
  maxPlayers: 12,

  start({ io, players, endGame }) {
    state = {
      players,
      phase:           "grid_pick",   // grid_pick | clue | vote | reveal | chameleon_guess | result
      selectedGrid:    null,
      secretWord:      null,
      chameleonId:     null,
      diceRoll:        null,          // { d1, d2 }
      clues:           {},            // socketId → string
      clueOrder:       [],            // socketIds in clue order
      votes:           {},            // socketId → targetId
      chameleonGuess:  null,
      timer:           null,
      io, players, endGame,
    };

    // Send grid list to host so it can display the picker
    io.to("host").emit("chameleon:grid_list", {
      grids: Object.keys(GRIDS),
    });

    // Tell players to wait while host picks grid
    io.emit("chameleon:waiting", { message: "Host is picking the word grid…" });
  },

  // Player pulled its initial state after UI loaded
  onPlayerReady({ socket }) {
    socket.emit("chameleon:waiting", { message: "Host is picking the word grid…" });
  },

  // Host pulls current state after its UI is ready
  onHostReady({ hostSocket }) {
    if (!state.phase) return;
    if (state.phase === "grid_pick") {
      hostSocket.emit("chameleon:grid_list", {
        grids: Object.keys(GRIDS),
        currentGrid: state.selectedGrid,
      });
    } else if (state.phase === "clue") {
      const { players, selectedGrid, clueOrder } = state;
      hostSocket.emit("chameleon:round_start", {
        words:       GRIDS[selectedGrid],
        clueOrder:   clueOrder.map(id => players[id]?.name ?? "?"),
        playerCount: Object.keys(players).length,
      });
      hostSocket.emit("chameleon:clue_update", {
        clues: clueOrder.map(id => ({ name: players[id]?.name ?? "?", clue: state.clues[id] ?? null })),
      });
      hostSocket.emit("host:show_action", { label: "⏭ Skip to Vote", type: "skip_to_vote" });
    } else if (state.phase === "vote") {
      hostSocket.emit("chameleon:vote_phase", {
        clues: state.clueOrder.map(id => ({
          name: state.players[id]?.name ?? "?",
          clue: state.clues[id] ?? "…",
        })),
      });
      hostSocket.emit("host:show_action", { label: "⏭ Force Reveal", type: "force_reveal" });
    }
  },

  // ── Phase helpers ─────────────────────────────────────────────────────────

  _startRound(io, players) {
    const grid = GRIDS[state.selectedGrid];

    // Roll two dice (1–4 row, 1–6 col)
    // Pick a random word directly — no dice needed, the server handles it
    const wordIndex  = Math.floor(Math.random() * grid.length);
    const secretWord = grid[wordIndex];

    // Pick a random chameleon
    const playerIds   = Object.keys(players);
    const chameleonId = playerIds[Math.floor(Math.random() * playerIds.length)];

    state.secretWord      = secretWord;
    state.secretWordIndex = wordIndex;
    state.chameleonId     = chameleonId;
    state.clues          = {};
    state.clueOrder      = [...playerIds].sort(() => Math.random() - 0.5);
    state.votes          = {};
    state.chameleonGuess = null;
    state.phase          = "clue";

    io.to("host").emit("chameleon:round_start", {
      words:       grid,
      clueOrder:   state.clueOrder.map(id => players[id]?.name ?? "?"),
      playerCount: playerIds.length,
    });

    // Each player gets their private role
    playerIds.forEach(id => {
      const isChameleon = id === chameleonId;
      players[id].socket.emit("chameleon:your_role", {
        isChameleon,
        secretWord:    isChameleon ? null : secretWord,
        grid:          state.selectedGrid,
        words:         grid,
      });
    });

    // Show skip button on host for clue phase
    io.to("host").emit("host:show_action", { label: "⏭ Skip to Vote", type: "skip_to_vote" });
  },

  _startVote() {
    state.phase = "vote";
    state.votes = {};
    const { io, players } = state;

    const playerList = Object.values(players).map(p => ({ id: p.id, name: p.name }));

    io.to("host").emit("chameleon:vote_phase", {
      clues: state.clueOrder.map(id => ({
        name:  players[id]?.name ?? "?",
        clue:  state.clues[id]  ?? "…",
      })),
    });

    // Players get the voting ballot (can't vote for themselves)
    Object.values(players).forEach(p => {
      p.socket.emit("chameleon:vote_ballot", {
        candidates: playerList.filter(c => c.id !== p.id),
      });
    });

    io.to("host").emit("host:show_action", { label: "⏭ Force Reveal", type: "force_reveal" });
  },

  _revealVotes() {
    state.phase = "reveal";
    const { io, players } = state;
    io.to("host").emit("host:hide_action");

    // Tally votes
    const tally = {};
    Object.values(players).forEach(p => { tally[p.id] = 0; });
    Object.values(state.votes).forEach(targetId => {
      if (tally[targetId] !== undefined) tally[targetId]++;
    });

    const totalVotes  = Object.values(state.votes).length;
    const maxVotes    = Math.max(...Object.values(tally));
    const majority    = maxVotes > totalVotes / 2;  // strictly more than half

    // Only accuse if someone has a strict majority, otherwise no one is caught
    const accused = majority
      ? Object.entries(tally).filter(([, v]) => v === maxVotes).map(([id]) => id)
      : [];

    const accusedNames = accused.map(id => players[id]?.name ?? "?");
    const caughtRight  = majority && accused.includes(state.chameleonId);

    io.to("host").emit("chameleon:reveal_votes", {
      votes: Object.entries(state.votes).map(([voterId, targetId]) => ({
        voter:  players[voterId]?.name ?? "?",
        target: players[targetId]?.name ?? "?",
      })),
      tally: Object.entries(tally).map(([id, count]) => ({
        name: players[id]?.name ?? "?", count,
      })).sort((a, b) => b.count - a.count),
      accused:      accusedNames,
      caughtRight,
    });

    io.emit("chameleon:vote_result", { accused: accusedNames, caughtRight });

    if (caughtRight) {
      // Give chameleon a chance to guess the word
      state.phase = "chameleon_guess";
      setTimeout(() => {
        io.to("host").emit("chameleon:guess_phase", {
          chameleonName: players[state.chameleonId]?.name ?? "?",
        });
        players[state.chameleonId]?.socket.emit("chameleon:you_must_guess", {
          grid:  state.selectedGrid,
          words: GRIDS[state.selectedGrid],
        });
        io.to("host").emit("host:show_action", { label: "⏭ Skip Guess", type: "skip_guess" });
      }, 3000);
    } else {
      // Chameleon escapes — end round
      setTimeout(() => game._endRound(false, null), 3000);
    }
  },

  _endRound(chameleonCaught, chameleonGuessedRight) {
    state.phase = "result";
    const { io, players } = state;
    io.to("host").emit("host:hide_action");

    // Determine winner
    let winner;
    if (!chameleonCaught) {
      winner = "chameleon";       // not caught at all
    } else if (chameleonGuessedRight) {
      winner = "chameleon";       // caught but guessed correctly
    } else {
      winner = "players";         // caught and couldn't guess
    }

    io.emit("chameleon:round_result", {
      winner,
      chameleonName:    players[state.chameleonId]?.name ?? "?",
      secretWord:       state.secretWord,
      secretWordIndex:  state.secretWordIndex,
      chameleonGuessedRight,
    });

    // After showing result, let host pick same or different grid
    setTimeout(() => {
      io.to("host").emit("chameleon:grid_list", {
        grids:        Object.keys(GRIDS),
        currentGrid:  state.selectedGrid,
      });
      io.emit("chameleon:waiting", { message: "Host is picking the next grid…" });
    }, 6000);
  },

  // ── Socket handlers ───────────────────────────────────────────────────────

  onHostAction({ payload, io, players }) {
    if (payload.type === "pick_grid") {
      state.selectedGrid = payload.grid;
      game._startRound(io, players);
    }

    if (payload.type === "skip_to_vote") {
      clearTimeout(state.timer);
      io.to("host").emit("host:hide_action");
      game._startVote();
    }

    if (payload.type === "force_reveal") {
      game._revealVotes();
    }

    if (payload.type === "skip_guess") {
      io.to("host").emit("host:hide_action");
      game._endRound(true, false);
    }
  },

  onPlayerAction({ socket, payload, players }) {
    // Player submits their clue word
    if (payload.type === "clue" && state.phase === "clue") {
      state.clues[socket.id] = (payload.text || "").trim().substring(0, 30);
      socket.emit("chameleon:clue_ack");

      // Update host with current clues
      state.io.to("host").emit("chameleon:clue_update", {
        clues: state.clueOrder.map(id => ({
          name: players[id]?.name ?? "?",
          clue: state.clues[id] ?? null,
        })),
      });

      // All players have given clues → move to vote
      if (Object.keys(players).every(id => state.clues[id])) {
        clearTimeout(state.timer);
        state.io.to("host").emit("host:hide_action");
        setTimeout(() => game._startVote(), 1000);
      }
    }

    // Player submits their vote
    if (payload.type === "vote" && state.phase === "vote") {
      state.votes[socket.id] = payload.targetId;
      socket.emit("chameleon:vote_ack");

      state.io.to("host").emit("chameleon:vote_progress", {
        voted: Object.keys(state.votes).length,
        total: Object.keys(players).length,
      });

      // All votes in → reveal
      if (Object.keys(players).every(id => state.votes[id])) {
        game._revealVotes();
      }
    }

    // Chameleon submits their word guess
    if (payload.type === "chameleon_guess" && state.phase === "chameleon_guess") {
      if (socket.id !== state.chameleonId) return;
      state.chameleonGuess = (payload.word || "").trim();
      const correct = state.chameleonGuess.toLowerCase() === state.secretWord.toLowerCase();

      state.io.to("host").emit("chameleon:chameleon_guessed", {
        guess: state.chameleonGuess,
        correct,
      });

      state.io.emit("chameleon:chameleon_guessed", { guess: state.chameleonGuess, correct });
      setTimeout(() => game._endRound(true, correct), 3000);
    }
  },

  onEnd() {
    clearTimeout(state.timer);
    state = {};
  },
};

module.exports = game;