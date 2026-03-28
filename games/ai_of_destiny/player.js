// socket is provided by the player shell
(() => {
  function $(id) { return document.getElementById(id); }

  let wakeLock = null;
  async function acquireWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } catch (_) {}
    }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquireWakeLock();
  });

  function showView(id) {
    ["aod-write-view", "aod-reveal-view", "aod-gameover-view"].forEach((v) => {
      $(v).style.display = v === id ? "" : "none";
    });
  }

  function renderScores(containerId, scores) {
    const html = scores.map((s, i) => `
      <div class="aod-score-row">
        <span>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
    $(containerId).innerHTML = html;
  }

  socket.on("aod:situation", ({ round, totalRounds, situation }) => {
    acquireWakeLock();
    showView("aod-write-view");
    $("aod-round-label").textContent = `Round ${round} of ${totalRounds}`;
    $("aod-situation").textContent = situation;
    $("aod-answer-input").value = "";
    $("aod-answer-input").disabled = false;
    $("aod-submit-btn").disabled = false;
    $("aod-answer-sent").textContent = "";
    $("aod-answer-input").focus();
  });

  $("aod-submit-btn").onclick = () => {
    const text = $("aod-answer-input").value.trim();
    if (!text) return;
    $("aod-answer-input").disabled = true;
    $("aod-submit-btn").disabled = true;
    socket.emit("player:action", { type: "answer", text });
  };

  socket.on("aod:answer_ack", () => {
    $("aod-answer-sent").textContent = "Submitted! AI is judging…";
  });

  socket.on("aod:reveal_player", ({ survived, yourResponse, reasoning, scores }) => {
    showView("aod-reveal-view");
    $("aod-reveal-emoji").textContent = survived ? "✅" : "💀";
    $("aod-reveal-msg").textContent = survived ? "You survived!" : "You died!";
    $("aod-reveal-response").textContent = `"${yourResponse}"`;
    $("aod-reveal-response").style.color = survived ? "var(--green)" : "var(--pink)";
    const reasonEl = $("aod-reveal-reasoning");
    if (reasonEl) {
      reasonEl.textContent = reasoning || (survived ? "The AI spared you." : "The AI was not impressed.");
      reasonEl.style.display = "block";
    }
    renderScores("aod-scores-list", scores);
  });

  socket.on("aod:gameover_player", ({ scores }) => {
    showView("aod-gameover-view");
    renderScores("aod-final-scores-list", scores);
  });

  socket.on("game:end", () => { releaseWakeLock(); });
})();
