// socket is provided by the host shell
(() => {
  function $(id) { return document.getElementById(id); }

  function showPanel(panelId) {
    ["aod-writing-panel", "aod-reveal-panel", "aod-gameover-panel"].forEach((id) => {
      $(id).style.display = id === panelId ? "" : "none";
    });
  }

  function renderScores(containerId, scores) {
    const html = scores.map((s, i) => `
      <div class="aod-score-row" style="animation-delay:${i * 0.1}s">
        <span>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
    $(containerId).innerHTML = html;
  }

  socket.on("aod:situation", ({ round, totalRounds, situation, timeLimit }) => {
    showPanel("aod-writing-panel");
    $("aod-round-header").textContent = `Round ${round} / ${totalRounds}`;
    $("aod-situation").textContent = situation;
    $("aod-progress").textContent = "Waiting for responses…";

    const fill = $("aod-timer-fill");
    fill.style.transition = "none";
    fill.style.width = "100%";
    requestAnimationFrame(() => {
      fill.style.transition = `width ${timeLimit}s linear`;
      fill.style.width = "0%";
    });
  });

  socket.on("aod:progress", ({ answered, total }) => {
    $("aod-progress").textContent = `${answered} / ${total} players responded`;
  });

  socket.on("aod:reveal", ({ round, totalRounds, results, scores }) => {
    showPanel("aod-reveal-panel");
    $("aod-reveal-header").textContent = `Round ${round} / ${totalRounds}`;
    $("aod-reveal-sub").textContent = round < totalRounds ? "Next round soon…" : "Final round!";

    $("aod-results-list").innerHTML = results.map((r, i) => `
      <div class="aod-result-row ${r.survived ? "survived" : "died"}" style="animation-delay:${i * 0.1}s">
        <span class="aod-result-emoji">${r.survived ? "✅" : "💀"}</span>
        <div style="flex:1">
          <div class="aod-result-name">${r.name}</div>
          <div class="aod-result-response">"${r.response}"</div>
          ${r.reasoning ? `<div class="aod-result-reasoning">${r.reasoning}</div>` : ""}
        </div>
      </div>`).join("");

    renderScores("aod-scores", scores);
  });

  socket.on("aod:gameover", ({ scores }) => {
    showPanel("aod-gameover-panel");
    renderScores("aod-final-scores", scores);
  });
})();
