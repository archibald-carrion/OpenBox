/**
 * GAME: Prompt war
 * ----------
 * Players are paired each round. Both players in a pair answer the same prompt.
 * Everyone else (including the odd-player-out who rotates each round) votes.
 * Authors hidden until reveal. 5 rounds, highest score wins.
 *
 * With N players: floor(N/2) pairs per round.
 * If N is odd, one player sits out of writing (rotates each round) and only votes.
 * Everyone answers the same number of prompts across the game.
 */

const PROMPTS = [
  "The worst thing to say on a first date: ___",
  "A terrible name for a baby: ___",
  "What's actually inside a black hole: ___",
  "The world's worst superpower: ___",
  "A bad thing to whisper at a funeral: ___",
  "The rejected 8th dwarf: ___",
  "What the dog is actually thinking: ___",
  "A terrible ice cream flavor: ___",
  "The worst job interview answer ever: ___",
  "Something you shouldn't 3D print: ___",
  "A bad name for a restaurant: ___",
  "What aliens think humans are for: ___",
  "The worst thing to put on a pizza: ___",
  "A terrible motivational poster: ___",
  "What's really at the end of a rainbow: ___",
  "The worst advice a doctor could give: ___",
  "A bad tagline for a country: ___",
  "What the moon smells like: ___",
  "A terrible app idea: ___",
  "The worst thing to say meeting the parents: ___",
  "A rejected Olympic sport: ___",
  "What dinosaurs really went extinct from: ___",
  "The worst fortune cookie message: ___",
  "A bad name for a law firm: ___",
  "What's really in the Bermuda Triangle: ___",
  "The worst superhero catchphrase: ___",
  "A terrible theme for a wedding: ___",
  "A bad slogan for a hospital: ___",
  "The worst thing to find in your cereal: ___",
  "A terrible children's book title: ___",
  "The worst thing to name a boat: ___",
  "A bad title for a self-help book: ___",
  "What Santa does in July: ___",
  "The least intimidating gang name: ___",
  "A terrible password: ___",
];

const ROUNDS      = 5;
const ANSWER_TIME = 60;
const VOTE_TIME   = 30;

let state    = {};
let _endGame = null;

const game = {
  id:         "promptwar",
  name:       "⚔️ Prompt War",
  minPlayers: 3,
  maxPlayers: 12,

  start({ io, players, endGame }) {
    _endGame = endGame;
    const playerIds = Object.keys(players);
    state = {
      players, io,
      phase:        "waiting",
      round:        0,
      scores:       Object.fromEntries(playerIds.map(id => [id, 0])),
      // Who sits out this round (rotates for odd player counts)
      sittingOut:   null,
      sittingOutIndex: 0,
      // Per-round
      pairs:        [],   // [{ prompt, playerA, playerB }]
      answers:      {},   // socketId -> answer text
      judgeIndex:   0,
      votes:        {},   // socketId -> "A" | "B"
      timer:        null,
      readyPlayers: new Set(),
      usedPrompts:  new Set(),
    };
  },

  onHostReady({ hostSocket }) {
    if (state.phase === "writing") {
      hostSocket.emit("promptwar:writing_phase", {
        round: state.round, total: ROUNDS,
        pairCount: state.pairs.length,
      });
      const answered = Object.keys(state.answers);
      if (answered.length) {
        hostSocket.emit("promptwar:answer_progress", {
          answeredNames: answered.map(id => state.players[id]?.name ?? "?"),
        });
      }
    }
  },

  onPlayerReady({ socket }) {
    state.readyPlayers.add(socket.id);
    const total = Object.keys(state.players).length;
    if (state.readyPlayers.size >= total && state.phase === "waiting") {
      state.phase = "writing";
      game._startRound();
    }
    // Rejoin mid writing phase
    if (state.phase === "writing") {
      const pair = state.pairs.find(p => p.playerA === socket.id || p.playerB === socket.id);
      if (pair) {
        socket.emit("promptwar:your_prompt", { prompt: pair.prompt, timeLimit: ANSWER_TIME });
      } else {
        // This player is sitting out this round
        socket.emit("promptwar:sitting_out", { message: "You're the judge this round — just vote!" });
      }
    }
  },

  _startRound() {
    const { io, players } = state;
    state.round++;
    state.answers    = {};
    state.votes      = {};
    state.judgeIndex = 0;
    state.pairs      = [];

    const playerIds = Object.keys(players);
    const isOdd     = playerIds.length % 2 === 1;

    // Rotate who sits out for odd player counts
    let activeIds = [...playerIds];
    if (isOdd) {
      state.sittingOut = playerIds[state.sittingOutIndex % playerIds.length];
      state.sittingOutIndex++;
      activeIds = activeIds.filter(id => id !== state.sittingOut);
    } else {
      state.sittingOut = null;
    }

    // Shuffle active players and pair them
    activeIds.sort(() => Math.random() - 0.5);
    const prompts = _pickPrompts(activeIds.length / 2, state.usedPrompts);

    for (let i = 0; i < activeIds.length; i += 2) {
      const prompt = prompts[i / 2];
      state.usedPrompts.add(prompt);
      state.pairs.push({ prompt, playerA: activeIds[i], playerB: activeIds[i + 1] });
    }

    // Tell host
    io.to("host").emit("promptwar:writing_phase", {
      round: state.round, total: ROUNDS,
      pairCount: state.pairs.length,
      sittingOutName: state.sittingOut ? players[state.sittingOut]?.name : null,
    });

    // Send prompts ONLY to the two players in each pair
    state.pairs.forEach(pair => {
      players[pair.playerA]?.socket.emit("promptwar:your_prompt", {
        prompt: pair.prompt, timeLimit: ANSWER_TIME,
      });
      players[pair.playerB]?.socket.emit("promptwar:your_prompt", {
        prompt: pair.prompt, timeLimit: ANSWER_TIME,
      });
    });

    // Sitting-out player is informed
    if (state.sittingOut) {
      players[state.sittingOut]?.socket.emit("promptwar:sitting_out", {
        message: "You're the judge this round — just vote!",
      });
    }

    state.phase = "writing";
    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._startJudging(), ANSWER_TIME * 1000);
  },

  _allAnswered() {
    return state.pairs.every(p =>
      state.answers[p.playerA] && state.answers[p.playerB]
    );
  },

  _startJudging() {
    clearTimeout(state.timer);
    state.phase = "judging";

    // Fill in blanks for players who didn't answer in time
    state.pairs.forEach(p => {
      if (!state.answers[p.playerA]) state.answers[p.playerA] = "...";
      if (!state.answers[p.playerB]) state.answers[p.playerB] = "...";
    });

    game._judgeNext();
  },

  _judgeNext() {
    const { io, players } = state;

    if (state.judgeIndex >= state.pairs.length) {
      game._showRoundResult();
      return;
    }

    state.votes      = {};
    const pair       = state.pairs[state.judgeIndex];
    const contenders = [pair.playerA, pair.playerB];

    // Host sees the two answers anonymously
    io.to("host").emit("promptwar:matchup", {
      round:        state.round,
      total:        ROUNDS,
      matchupIndex: state.judgeIndex,
      matchupCount: state.pairs.length,
      prompt:       pair.prompt,
      slots: [
        { slot: "A", answer: state.answers[pair.playerA] },
        { slot: "B", answer: state.answers[pair.playerB] },
      ],
    });

    // All players who are NOT in this pair vote (including sitting-out player)
    Object.keys(players).forEach(id => {
      if (contenders.includes(id)) {
        players[id].socket.emit("promptwar:you_are_contender", {
          prompt:      pair.prompt,
          your_answer: state.answers[id],
        });
      } else {
        players[id].socket.emit("promptwar:vote_matchup", {
          prompt: pair.prompt,
          slots: [
            { slot: "A", answer: state.answers[pair.playerA] },
            { slot: "B", answer: state.answers[pair.playerB] },
          ],
        });
      }
    });

    io.to("host").emit("host:show_action", { label: "⏭ Reveal", type: "reveal" });

    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._revealMatchup(), VOTE_TIME * 1000);
  },

  _revealMatchup() {
    clearTimeout(state.timer);
    const { io, players } = state;
    io.to("host").emit("host:hide_action");

    const pair = state.pairs[state.judgeIndex];

    const tally = { A: 0, B: 0 };
    Object.values(state.votes).forEach(slot => { tally[slot] = (tally[slot] || 0) + 1; });

    // Award points
    state.scores[pair.playerA] = (state.scores[pair.playerA] || 0) + tally.A * 100;
    state.scores[pair.playerB] = (state.scores[pair.playerB] || 0) + tally.B * 100;

    const result = [
      { slot: "A", name: players[pair.playerA]?.name ?? "?", answer: state.answers[pair.playerA], votes: tally.A },
      { slot: "B", name: players[pair.playerB]?.name ?? "?", answer: state.answers[pair.playerB], votes: tally.B },
    ].sort((a, b) => b.votes - a.votes);

    io.to("host").emit("promptwar:matchup_result", { prompt: pair.prompt, result });
    io.emit("promptwar:matchup_result_player", { result });

    state.judgeIndex++;
    state.timer = setTimeout(() => game._judgeNext(), 6000);
  },

  _showRoundResult() {
    const { io } = state;
    const scores  = game._scoreBoard();

    io.to("host").emit("promptwar:round_result", { round: state.round, total: ROUNDS, scores });
    io.emit("promptwar:round_result_player",     { round: state.round, total: ROUNDS, scores });

    if (state.round >= ROUNDS) {
      state.timer = setTimeout(() => {
        io.emit("promptwar:gameover", { scores });
        setTimeout(() => _endGame(), 10000);
      }, 6000);
    } else {
      state.phase = "writing";
      state.timer = setTimeout(() => game._startRound(), 6000);
    }
  },

  _scoreBoard() {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: state.players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  onPlayerAction({ socket, payload, players }) {
    if (payload.type === "answer" && state.phase === "writing") {
      if (state.answers[socket.id]) return;
      // Only accept answers from players who are in a pair this round
      const inPair = state.pairs.some(p => p.playerA === socket.id || p.playerB === socket.id);
      if (!inPair) return;

      state.answers[socket.id] = (payload.text || "").trim().substring(0, 120) || "...";
      socket.emit("promptwar:answer_ack");

      state.io.to("host").emit("promptwar:answer_progress", {
        answeredNames: Object.keys(state.answers).map(id => state.players[id]?.name ?? "?"),
      });

      if (game._allAnswered()) {
        clearTimeout(state.timer);
        game._startJudging();
      }
    }

    if (payload.type === "vote" && state.phase === "judging") {
      if (state.votes[socket.id]) return;
      const pair = state.pairs[state.judgeIndex];
      if (socket.id === pair.playerA || socket.id === pair.playerB) return; // contenders can't vote

      state.votes[socket.id] = payload.slot;
      socket.emit("promptwar:vote_ack");

      // Eligible voters = everyone NOT in this specific pair
      const voterCount = Object.keys(players).filter(id =>
        id !== pair.playerA && id !== pair.playerB
      ).length;

      state.io.to("host").emit("promptwar:vote_progress", {
        voted: Object.keys(state.votes).length,
        total: voterCount,
      });

      if (Object.keys(state.votes).length >= voterCount) {
        clearTimeout(state.timer);
        game._revealMatchup();
      }
    }
  },

  onHostAction({ payload }) {
    if (payload.type === "reveal") {
      clearTimeout(state.timer);
      game._revealMatchup();
    }
  },

  onEnd() {
    clearTimeout(state.timer);
    state    = {};
    _endGame = null;
  },
};

function _pickPrompts(n, usedSet) {
  const available = PROMPTS.filter(p => !usedSet.has(p));
  const pool      = available.length >= n ? available : PROMPTS; // reset if exhausted
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n);
}

module.exports = game;
