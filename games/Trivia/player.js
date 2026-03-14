// socket is provided by the player shell
(() => {
  const COLORS = ["A", "B", "C", "D"];
  function $(id) { return document.getElementById(id); }

  function showWait(emoji, msg) {
    $("trivia-question-panel").style.display = "none";
    $("trivia-wait").style.display           = "";
    $("trivia-wait-emoji").textContent        = emoji;
    $("trivia-wait-msg").textContent          = msg;
  }

  socket.on("trivia:question", ({ index, total, question, choices }) => {
    $("trivia-question-panel").style.display = "";
    $("trivia-wait").style.display           = "none";
    $("trivia-status").textContent           = "";
    $("trivia-prog").textContent             = `Question ${index + 1} of ${total}`;
    $("trivia-q").textContent               = question;

    const container = $("trivia-btns");
    container.innerHTML = choices.map((c, i) =>
      `<button class="trivia-choice-btn ${COLORS[i]}" data-idx="${i}">${COLORS[i]}. ${c}</button>`
    ).join("");

    container.querySelectorAll(".trivia-choice-btn").forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll(".trivia-choice-btn").forEach(b => b.disabled = true);
        socket.emit("player:action", { type: "answer", choice: +btn.dataset.idx });
      };
    });
  });

  socket.on("trivia:ack", ({ correct }) => {
    const status = $("trivia-status");
    status.textContent = correct ? "✅ Correct!" : "❌ Wrong!";
    status.style.color = correct ? "var(--green)" : "var(--pink)";
  });

  socket.on("trivia:reveal", () => {
    showWait("📊", "Check the scores on the TV!");
  });

  socket.on("trivia:gameover", () => {
    showWait("🏆", "Game over! Check the TV!");
  });
})();