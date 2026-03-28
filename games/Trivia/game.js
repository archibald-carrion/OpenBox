/**
 * GAME: Quick Trivia
 * Server-side logic only. UI lives in host.html / host.js / player.html / player.js
 */

const QUESTIONS = [
  { q: "What planet is closest to the Sun?",      choices: ["Venus","Mercury","Mars","Earth"],             answer: 1 },
  { q: "How many sides does a hexagon have?",      choices: ["5","6","7","8"],                              answer: 1 },
  { q: "What is the chemical symbol for Gold?",    choices: ["Go","Gl","Ag","Au"],                          answer: 3 },
  { q: "Who painted the Mona Lisa?",               choices: ["Picasso","Van Gogh","Da Vinci","Rembrandt"],  answer: 2 },
  { q: "What is 7 × 8?",                           choices: ["54","56","58","62"],                          answer: 1 },
  { q: "Which ocean is the largest?",              choices: ["Atlantic","Indian","Arctic","Pacific"],       answer: 3 },
  { q: "How many bones in the adult human body?",  choices: ["196","206","216","226"],                      answer: 1 },
  { q: "What gas do plants absorb from the air?",  choices: ["Oxygen","Nitrogen","CO2","Hydrogen"],         answer: 2 },
  { q: "What is the capital of Japan?",            choices: ["Seoul","Beijing","Tokyo","Bangkok"],          answer: 2 },
  { q: "How many players on a basketball team?",   choices: ["4","5","6","7"],                              answer: 1 },
];

let state = {};
let _endGame = null;  // kept outside state so clearTimeout in onEnd can't race it

const game = {
  id:         "trivia",
  name:       "⚡ Quick Trivia",
  minPlayers: 1,
  maxPlayers: 16,

  start({ io, players, endGame }) {
    _endGame = endGame;
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 6);
    state = {
      questions:     shuffled,
      current:       0,
      scores:        Object.fromEntries(Object.keys(players).map(id => [id, 0])),
      answered:      {},
      questionStart: Date.now(),
      timer:         null,
      io, players,
    };
    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._revealAnswer(), 15000);
  },

  // Host pulled its initial state
  onHostReady({ hostSocket }) {
    if (!state.questions) return;
    game._sendCurrentQuestionTo(hostSocket);
    hostSocket.emit("host:show_action", { label: "⏭ Skip", type: "skip" });
  },

  // Player pulled its initial state
  onPlayerReady({ socket }) {
    if (!state.questions) return;
    const q = state.questions[state.current];
    socket.emit("trivia:question", {
      index: state.current, total: state.questions.length,
      question: q.q, choices: q.choices,
    });
  },

  _sendCurrentQuestionTo(target) {
    const q = state.questions[state.current];
    target.emit("trivia:question", {
      index: state.current, total: state.questions.length,
      question: q.q, choices: q.choices,
    });
  },

  // Used for rounds 2+ — all UIs are loaded by then so broadcast is safe
  _sendQuestion() {
    state.answered      = {};
    state.questionStart = Date.now();
    state.io.emit("trivia:question", {
      index: state.current, total: state.questions.length,
      question: state.questions[state.current].q,
      choices:  state.questions[state.current].choices,
    });
    state.io.to("host").emit("host:show_action", { label: "⏭ Skip", type: "skip" });
    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._revealAnswer(), 15000);
  },

  _revealAnswer() {
    clearTimeout(state.timer);
    state.io.to("host").emit("host:hide_action");

    const q = state.questions[state.current];
    state.io.emit("trivia:reveal", {
      correctIndex: q.answer,
      scores:       game._scoreBoard(),
    });

    state.current++;
    if (state.current < state.questions.length) {
      state.timer = setTimeout(() => game._sendQuestion(), 4000);
    } else {
      state.timer = setTimeout(() => {
        state.io.emit("trivia:gameover", { scores: game._scoreBoard() });
        setTimeout(() => _endGame(), 8000);
      }, 4000);
    }
  },

  _scoreBoard() {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: state.players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  onPlayerAction({ socket, player, payload, players }) {
    if (payload.type !== "answer" || state.answered[player.id]) return;

    state.answered[player.id] = true;
    const q       = state.questions[state.current];
    const elapsed = Date.now() - state.questionStart;
    const correct = payload.choice === q.answer;

    if (correct) {
      const speed = Math.max(0, 1 - elapsed / 15000);
      state.scores[player.id] = (state.scores[player.id] || 0) + Math.round(100 + speed * 400);
    }

    socket.emit("trivia:ack", { correct });

    if (Object.keys(state.answered).length === Object.keys(state.players).length) {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => game._revealAnswer(), 800);
    }
  },

  onHostAction({ payload }) {
    if (payload.type === "skip") {
      clearTimeout(state.timer);
      game._revealAnswer();
    }
  },

  onEnd() {
    clearTimeout(state.timer);
    state    = {};
    _endGame = null;
  },
};

module.exports = game;