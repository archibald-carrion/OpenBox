/**
 * GAME: Quick Trivia
 * ──────────────────
 * Players answer multiple-choice questions as fast as possible.
 * Points are awarded based on speed + correctness.
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
];

let state = {};

const game = {
  id: "trivia",
  name: "⚡ Quick Trivia",
  minPlayers: 1,
  maxPlayers: 16,

  start({ io, players, endGame }) {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 6);
    state = {
      questions:     shuffled,
      current:       0,
      scores:        Object.fromEntries(Object.keys(players).map(id => [id, 0])),
      answered:      {},
      questionStart: 0,
      timer:         null,
      io, players, endGame,
    };
    game._sendQuestion();
  },

  _sendQuestion() {
    const q = state.questions[state.current];
    state.answered      = {};
    state.questionStart = Date.now();
    state.io.emit("trivia:question", {
      index: state.current, total: state.questions.length,
      question: q.q, choices: q.choices,
    });
    clearTimeout(state.timer);
    state.timer = setTimeout(() => game._revealAnswer(), 15000);
  },

  _revealAnswer() {
    clearTimeout(state.timer);
    const q = state.questions[state.current];
    state.io.emit("trivia:reveal", {
      correctIndex: q.answer, scores: game._scoreBoard(),
    });
    state.current++;
    if (state.current < state.questions.length) {
      state.timer = setTimeout(() => game._sendQuestion(), 4000);
    } else {
      state.timer = setTimeout(() => {
        state.io.emit("trivia:gameover", { scores: game._scoreBoard() });
        setTimeout(() => state.endGame(), 8000);
      }, 4000);
    }
  },

  _scoreBoard() {
    return Object.entries(state.scores)
      .map(([id, score]) => ({ name: state.players[id]?.name ?? "?", score }))
      .sort((a, b) => b.score - a.score);
  },

  onPlayerAction({ socket, payload, players }) {
    if (payload.type !== "answer" || state.answered[socket.id]) return;
    state.answered[socket.id] = true;
    const q       = state.questions[state.current];
    const elapsed = Date.now() - state.questionStart;
    const correct = payload.choice === q.answer;
    if (correct) {
      const speed = Math.max(0, 1 - elapsed / 15000);
      state.scores[socket.id] = (state.scores[socket.id] || 0) + Math.round(100 + speed * 400);
    }
    socket.emit("trivia:ack", { correct });
    if (Object.keys(players).every(id => state.answered[id])) {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => game._revealAnswer(), 800);
    }
  },

  onHostAction({ payload }) {
    if (payload.type === "skip") { clearTimeout(state.timer); game._revealAnswer(); }
  },
};

module.exports = game;
