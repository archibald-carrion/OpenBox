// socket is provided by the host shell
(() => {
  function $(id) { return document.getElementById(id); }

  function showPanel(id) {
    ["pw-writing-panel","pw-judging-panel","pw-result-panel","pw-scores-panel"]
      .forEach(p => $(p).style.display = p === id ? "block" : "none");
  }

  function renderScores(scores) {
    $("pw-scoreboard").innerHTML = scores.map((s, i) => `
      <div class="score-row" style="animation-delay:${i * 0.08}s">
        <span>${["🥇","🥈","🥉"][i] ?? "#"+(i+1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
  }

  socket.on("promptwar:writing_phase", ({ totalMatchups, answered, totalAnswers }) => {
    $("pw-writing-title").textContent = `${totalMatchups} battle${totalMatchups > 1 ? "s" : ""} — everyone is writing…`;
    $("pw-writing-judge").textContent = "";
    $("pw-answered-list").innerHTML   = "";
    $("pw-writing-count").textContent = `0 / ${totalAnswers} answers submitted`;
    showPanel("pw-writing-panel");
  });

  socket.on("promptwar:answer_progress", ({ answered, totalAnswers }) => {
    $("pw-writing-count").textContent = `${answered} / ${totalAnswers} answers submitted`;
    $("pw-answered-list").innerHTML   = ""; // no names — keeps authorship anonymous
  });

  socket.on("promptwar:matchup", ({ matchupIndex, matchupCount, prompt, slots }) => {
    $("pw-judging-sub").textContent = `Battle ${matchupIndex + 1} of ${matchupCount}`;
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
    $("pw-vote-bar").style.width   = `${(voted / total) * 100}%`;
    $("pw-vote-count").textContent = `${voted} / ${total} voted`;
  });

  socket.on("promptwar:matchup_result", ({ prompt, result }) => {
    $("pw-result-prompt").textContent = prompt;
    $("pw-result-list").innerHTML = result.map((r, i) => `
      <div class="pw-result-row" style="animation-delay:${i * 0.12}s">
        <div class="pw-result-votes">${r.votes}</div>
        <div>
          <div class="pw-result-answer">"${r.answer}"</div>
          <div class="pw-result-name">${r.name}</div>
        </div>
      </div>`).join("");
    showPanel("pw-result-panel");
  });

  socket.on("promptwar:gameover", ({ scores }) => {
    renderScores(scores);
    showPanel("pw-scores-panel");
  });
})();