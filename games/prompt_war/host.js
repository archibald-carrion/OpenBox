// socket is provided by the host shell
(() => {
  function $(id) { return document.getElementById(id); }

  function showPanel(id) {
    ["pw-writing-panel","pw-judging-panel","pw-result-panel","pw-scores-panel"]
      .forEach(p => $(p).style.display = p === id ? "block" : "none");
  }

  function renderScores(containerId, scores) {
    $(containerId).innerHTML = scores.map((s, i) => `
      <div class="score-row" style="animation-delay:${i * 0.08}s">
        <span>${["trophy","🥈","🥉"][i] ?? "#"+(i+1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
  }

  socket.on("promptwar:writing_phase", ({ round, total, pairCount }) => {
    $("pw-writing-title").textContent = `Round ${round} / ${total} — ${pairCount} matchup${pairCount>1?"s":""}`;
    $("pw-answered-list").innerHTML   = "";
    showPanel("pw-writing-panel");
  });

  socket.on("promptwar:answer_progress", ({ answeredNames }) => {
    $("pw-answered-list").innerHTML = answeredNames.map(name =>
      `<div class="pw-answer-pill">${name}</div>`).join("");
  });

  socket.on("promptwar:matchup", ({ round, total, matchupIndex, matchupCount, prompt, slots }) => {
    $("pw-judging-sub").textContent = `Round ${round}/${total} — Matchup ${matchupIndex+1} of ${matchupCount}`;
    $("pw-prompt").textContent      = prompt;
    $("pw-vote-bar").style.width    = "0%";
    $("pw-vote-count").textContent  = "";

    $("pw-answers-grid").innerHTML = slots.map(s => `
      <div class="pw-answer-card">
        <span class="answer-letter">${s.slot}</span>
        ${s.answer}
      </div>`).join("");

    showPanel("pw-judging-panel");
  });

  socket.on("promptwar:vote_progress", ({ voted, total }) => {
    $("pw-vote-bar").style.width   = `${(voted/total)*100}%`;
    $("pw-vote-count").textContent = `${voted} / ${total} voted`;
  });

  socket.on("promptwar:matchup_result", ({ prompt, result }) => {
    $("pw-result-prompt").textContent = prompt;
    $("pw-result-list").innerHTML = result.map((r, i) => `
      <div class="pw-result-row" style="animation-delay:${i*0.12}s">
        <div class="pw-result-votes">${r.votes}</div>
        <div>
          <div class="pw-result-answer">"${r.answer}"</div>
          <div class="pw-result-name">${r.name}</div>
        </div>
      </div>`).join("");
    showPanel("pw-result-panel");
  });

  socket.on("promptwar:round_result", ({ round, total, scores }) => {
    $("pw-scores-title").textContent = round >= total ? "Final Scores!" : `After Round ${round} / ${total}`;
    renderScores("pw-scoreboard", scores);
    showPanel("pw-scores-panel");
  });

  socket.on("promptwar:gameover", ({ scores }) => {
    $("pw-scores-title").textContent = "Final Scores!";
    renderScores("pw-scoreboard", scores);
    showPanel("pw-scores-panel");
  });
})();
