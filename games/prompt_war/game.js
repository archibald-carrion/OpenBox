/**
 * GAME: Prompt War
 * ----------------
 * Each player answers PROMPTS_PER_PLAYER prompts (default 2).
 * Pairings are reshuffled each batch so you face different opponents.
 * All writing happens simultaneously upfront.
 * Then every matchup is voted on one by one.
 * Authors hidden until each reveal.
 */

const PROMPTS           = require('./assets/prompts.json');
const PROMPTS_PER_PLAYER = 2;   // how many prompts each player answers
const ANSWER_TIME        = 60;  // seconds to write all answers
const VOTE_TIME          = 30;  // seconds to vote per matchup

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
      scores:       Object.fromEntries(playerIds.map(id => [id, 0])),

      // pairs is a flat list of all matchups
      // each pair: { prompt, playerA, playerB, pairId }
      pairs:        [],

      // answers keyed by `${pairId}:${socketId}`
      answers:      {},

      // total number of answer slots to fill (pairs.length * 2)
      totalAnswers: 0,

      judgeIndex:   0,
      votes:        {},
      timer:        null,
      readyPlayers: new Set(),
    };
  },

  onHostReady({ hostSocket }) {
    if (state.phase === "writing") {
      hostSocket.emit("promptwar:writing_phase", {
        totalMatchups: state.pairs.length,
        answered:      Object.keys(state.answers).length,
        totalAnswers:  state.totalAnswers,
      });
    }
  },

  onPlayerReady({ socket, player }) {
    state.readyPlayers.add(player.id);
    const total = Object.keys(state.players).length;
    if (state.readyPlayers.size >= total && state.phase === "waiting") {
      state.phase = "writing";
      game._startWriting();
    }
    if (state.phase === "writing") {
      // Resend all prompts this player needs to answer
      game._sendPromptsToPlayer(socket);
    }
  },

  _buildPairs() {
    const playerIds  = [...Object.keys(state.players)];
    const n          = playerIds.length;
    const allPairs   = [];
    let   pairCounter = 0;

    // We need each player to appear in exactly PROMPTS_PER_PLAYER pairs.
    // Strategy: run PROMPTS_PER_PLAYER pairing passes.
    // Each pass pairs everyone using a shuffle, ensuring no one sits out.
    // For odd N: add a "bye" slot so the list is even, then redistribute
    // the bye player into an existing pair as a triple (A vs B vs C voted separately —
    // but here we just re-run until everyone gets their quota).
    //
    // Simpler guaranteed approach:
    //   - Track how many pairs each player still needs (quota = PROMPTS_PER_PLAYER)
    //   - Repeatedly pick the two players with the highest remaining quota and pair them
    //   - Shuffle to avoid always pairing the same people
    //   - Continue until all quotas are 0

    const quota = Object.fromEntries(playerIds.map(id => [id, PROMPTS_PER_PLAYER]));

    // Safety cap: at most N * PROMPTS_PER_PLAYER / 2 pairs
    const maxPairs = Math.ceil(n * PROMPTS_PER_PLAYER / 2);
    let attempts   = 0;

    while (attempts++ < 1000) {
      // Players still needing pairs, sorted by remaining quota desc then shuffled for variety
      const needing = playerIds
        .filter(id => quota[id] > 0)
        .sort((a, b) => quota[b] - quota[a] || Math.random() - 0.5);

      if (needing.length < 2) break;

      // Pick top two — but avoid repeating a pair we already made if possible
      let playerA = needing[0];
      let playerB = null;

      // Find a partner: prefer someone we haven't faced yet
      const alreadyFaced = new Set(
        allPairs
          .filter(p => p.playerA === playerA || p.playerB === playerA)
          .map(p => p.playerA === playerA ? p.playerB : p.playerA)
      );

      for (const candidate of needing.slice(1)) {
        if (!alreadyFaced.has(candidate)) { playerB = candidate; break; }
      }
      // If everyone was already faced, just pick anyone
      if (!playerB) playerB = needing[1];

      allPairs.push({
        pairId:  `p${pairCounter++}`,
        prompt:  null,
        playerA,
        playerB,
      });

      quota[playerA]--;
      quota[playerB]--;

      if (allPairs.length >= maxPairs) break;
    }

    // Assign unique prompts
    const prompts = _pickPrompts(allPairs.length);
    allPairs.forEach((p, i) => { p.prompt = prompts[i]; });

    return allPairs;
  },

  _startWriting() {
    const { io, players } = state;

    state.pairs       = game._buildPairs();
    state.totalAnswers = state.pairs.length * 2;
    state.answers     = {};

    io.to("host").emit("promptwar:writing_phase", {
      totalMatchups: state.pairs.length,
      answered:      0,
      totalAnswers:  state.totalAnswers,
    });

    // Send each player all their prompts at once
    Object.keys(players).forEach(id => {
      game._sendPromptsToPlayer(players[id].socket);
    });

    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._startVoting(), ANSWER_TIME * 1000);
  },

  _sendPromptsToPlayer(socket) {
    const myPairs = state.pairs.filter(
      p => p.playerA === socket.id || p.playerB === socket.id
    );
    socket.emit("promptwar:your_prompts", {
      prompts:   myPairs.map(p => ({ pairId: p.pairId, prompt: p.prompt })),
      timeLimit: ANSWER_TIME,
    });
  },

  _allAnswered() {
    return Object.keys(state.answers).length >= state.totalAnswers;
  },

  _startVoting() {
    clearTimeout(state.timer);

    // Fill blanks
    state.pairs.forEach(p => {
      const keyA = `${p.pairId}:${p.playerA}`;
      const keyB = `${p.pairId}:${p.playerB}`;
      if (!state.answers[keyA]) state.answers[keyA] = "...";
      if (!state.answers[keyB]) state.answers[keyB] = "...";
    });

    state.phase      = "voting";
    state.judgeIndex = 0;
    game._nextMatchup();
  },

  _nextMatchup() {
    const { io, players } = state;

    if (state.judgeIndex >= state.pairs.length) {
      game._showFinalResult();
      return;
    }

    state.votes      = {};
    const pair       = state.pairs[state.judgeIndex];
    const contenders = [pair.playerA, pair.playerB];
    const answerA    = state.answers[`${pair.pairId}:${pair.playerA}`];
    const answerB    = state.answers[`${pair.pairId}:${pair.playerB}`];

    io.to("host").emit("promptwar:matchup", {
      matchupIndex: state.judgeIndex,
      matchupCount: state.pairs.length,
      prompt:       pair.prompt,
      slots: [
        { slot: "A", answer: answerA },
        { slot: "B", answer: answerB },
      ],
    });

    Object.keys(players).forEach(id => {
      if (contenders.includes(id)) {
        players[id].socket.emit("promptwar:you_are_contender", {
          prompt:      pair.prompt,
          your_answer: state.answers[`${pair.pairId}:${id}`],
        });
      } else {
        players[id].socket.emit("promptwar:vote_matchup", {
          prompt: pair.prompt,
          slots: [
            { slot: "A", answer: answerA },
            { slot: "B", answer: answerB },
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

    const pair   = state.pairs[state.judgeIndex];
    const answerA = state.answers[`${pair.pairId}:${pair.playerA}`];
    const answerB = state.answers[`${pair.pairId}:${pair.playerB}`];

    const tally = { A: 0, B: 0 };
    Object.values(state.votes).forEach(slot => { tally[slot] = (tally[slot] || 0) + 1; });

    state.scores[pair.playerA] = (state.scores[pair.playerA] || 0) + tally.A * 100;
    state.scores[pair.playerB] = (state.scores[pair.playerB] || 0) + tally.B * 100;

    const result = [
      { slot: "A", name: players[pair.playerA]?.name ?? "?", answer: answerA, votes: tally.A },
      { slot: "B", name: players[pair.playerB]?.name ?? "?", answer: answerB, votes: tally.B },
    ].sort((a, b) => b.votes - a.votes);

    io.to("host").emit("promptwar:matchup_result", { prompt: pair.prompt, result });
    io.emit("promptwar:matchup_result_player", { result });

    state.judgeIndex++;
    state.timer = setTimeout(() => game._nextMatchup(), 6000);
  },

  _showFinalResult() {
    const { io } = state;
    const scores  = game._scoreBoard();
    io.to("host").emit("promptwar:gameover", { scores });
    io.emit("promptwar:gameover_player", { scores });
    setTimeout(() => _endGame(), 10000);
  },

  _scoreBoard() {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: state.players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  onPlayerAction({ socket, player, payload, players }) {
    if (payload.type === "answer" && state.phase === "writing") {
      const { pairId, text } = payload;
      const key = `${pairId}:${player.id}`;
      if (state.answers[key]) return; // already answered this one

      // Verify this player is actually in this pair
      const pair = state.pairs.find(p => p.pairId === pairId);
      if (!pair || (pair.playerA !== player.id && pair.playerB !== player.id)) return;

      state.answers[key] = (text || "").trim().substring(0, 120) || "...";

      const answered = Object.keys(state.answers).length;
      state.io.to("host").emit("promptwar:answer_progress", {
        answered,
        totalAnswers: state.totalAnswers,
      });

      // Ack just this specific answer
      socket.emit("promptwar:answer_ack", { pairId });

      if (game._allAnswered()) {
        clearTimeout(state.timer);
        game._startVoting();
      }
    }

    if (payload.type === "vote" && state.phase === "voting") {
      if (state.votes[player.id]) return;
      const pair = state.pairs[state.judgeIndex];
      if (player.id === pair.playerA || player.id === pair.playerB) return;

      state.votes[player.id] = payload.slot;
      socket.emit("promptwar:vote_ack");

      const voterCount = Object.keys(state.players).filter(id =>
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

function _pickPrompts(n) {
  return [...PROMPTS].sort(() => Math.random() - 0.5).slice(0, n);
}

module.exports = game;