// socket is provided by the host shell
(() => {
  const COLORS = ["A", "B", "C", "D"];

  function $(id) { return document.getElementById(id); }

  function showScores(scores, title) {
    $("trivia-question-view").style.display = "none";
    $("trivia-score-view").style.display    = "";
    $("trivia-score-title").textContent     = title ?? "🏆 Scores";
    $("trivia-scoreboard").innerHTML = scores.map((s, i) => `
      <div class="score-row" style="animation-delay:${i * 0.1}s">
        <span>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i+1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
  }

  socket.on("trivia:question", ({ index, total, question, choices }) => {
    $("trivia-question-view").style.display = "";
    $("trivia-score-view").style.display    = "none";
    $("trivia-header").textContent   = `Question ${index + 1} / ${total}`;
    $("trivia-question").textContent = question;
    $("trivia-choices").innerHTML    = choices.map((c, i) =>
      `<div class="trivia-choice ${COLORS[i]}">${COLORS[i]}. ${c}</div>`
    ).join("");

    // Reset + animate timer bar
    const fill = $("trivia-timer-fill");
    fill.style.transition = "none";
    fill.style.width      = "100%";
    requestAnimationFrame(() => {
      fill.style.transition = "width 15s linear";
      fill.style.width      = "0%";
    });
  });

  socket.on("trivia:reveal", ({ correctIndex, scores }) => {
    document.querySelectorAll(".trivia-choice").forEach((el, i) =>
      el.classList.add(i === correctIndex ? "correct" : "wrong"));
    setTimeout(() => showScores(scores), 2000);
  });

  socket.on("trivia:gameover", ({ scores }) => {
    showScores(scores, "🏆 Final Scores!");
  });
})();