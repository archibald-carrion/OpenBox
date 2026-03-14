// socket is provided by the player shell
(() => {
  function $(id) { return document.getElementById(id); }

  function showView(id) {
    ["pw-write-view","pw-vote-view","pw-wait-view","pw-round-view"]
      .forEach(v => $(v).style.display = v === id ? "" : "none");
  }

  function wait(emoji, msg, sub) {
    showView("pw-wait-view");
    $("pw-wait-emoji").textContent = emoji;
    $("pw-wait-msg").textContent   = msg;
    $("pw-wait-sub").textContent   = sub ?? "";
  }

  // Writing phase
  socket.on("promptwar:your_prompt", ({ prompt, timeLimit }) => {
    $("pw-round-label").textContent = `You have ${timeLimit}s — make it funny!`;
    $("pw-my-prompt").textContent   = prompt;
    $("pw-answer-input").value      = "";
    $("pw-answer-input").disabled   = false;
    $("pw-submit-btn").disabled     = false;
    $("pw-answer-sent").textContent = "";
    showView("pw-write-view");
  });

  $("pw-submit-btn").onclick = submitAnswer;
  $("pw-answer-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAnswer(); }
  });

  function submitAnswer() {
    const text = $("pw-answer-input").value.trim();
    if (!text) return;
    $("pw-answer-input").disabled   = true;
    $("pw-submit-btn").disabled     = true;
    $("pw-answer-sent").textContent = "Submitted! Waiting for others...";
    socket.emit("player:action", { type: "answer", text });
  }

  socket.on("promptwar:sitting_out", ({ message }) => {
    wait("🧑\u200d⚖️", "Judge Mode!", message);
  });

  // Contender view — you're in this matchup, just watch
  socket.on("promptwar:you_are_contender", ({ prompt, your_answer }) => {
    wait("🥊", `Your answer is in the ring!`, `"${your_answer}"`);
  });

  // Voter view — vote for the funniest
  socket.on("promptwar:vote_matchup", ({ prompt, slots }) => {
    $("pw-vote-prompt-text").textContent = prompt;
    $("pw-vote-sent").textContent        = "";

    $("pw-vote-options").innerHTML = slots.map(s => `
      <button class="pw-vote-option" data-slot="${s.slot}">
        <span class="vote-opt-letter">${s.slot}</span>
        ${s.answer}
      </button>`).join("");

    document.querySelectorAll(".pw-vote-option").forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        document.querySelectorAll(".pw-vote-option").forEach(b => {
          b.classList.remove("selected"); b.disabled = false;
        });
        btn.classList.add("selected");
        document.querySelectorAll(".pw-vote-option").forEach(b => b.disabled = true);
        $("pw-vote-sent").textContent = "Vote locked in!";
        socket.emit("player:action", { type: "vote", slot: btn.dataset.slot });
      };
    });

    showView("pw-vote-view");
  });

  // Matchup result
  socket.on("promptwar:matchup_result_player", ({ result }) => {
    const winner = result[0];
    if (winner && winner.votes > 0) {
      wait("😂", `${winner.name} wins!`, `"${winner.answer}"`);
    } else {
      wait("🤷", "It's a draw!", "");
    }
  });

  // Round scores
  socket.on("promptwar:round_result_player", ({ round, total, scores }) => {
    $("pw-round-msg").textContent = round >= total ? "Final Scores!" : `After Round ${round} / ${total}`;
    $("pw-round-scores").innerHTML = scores.map((s, i) => `
      <div class="pw-result-mini">
        <div class="mini-name">${["🥇","🥈","🥉"][i] ?? "#"+(i+1)} ${s.name}</div>
        <div class="mini-score">${s.score} pts</div>
      </div>`).join("");
    showView("pw-round-view");
  });

  socket.on("promptwar:gameover", ({ scores }) => {
    $("pw-round-msg").textContent = "Game Over!";
    $("pw-round-scores").innerHTML = scores.map((s, i) => `
      <div class="pw-result-mini">
        <div class="mini-name">${["🥇","🥈","🥉"][i] ?? "#"+(i+1)} ${s.name}</div>
        <div class="mini-score">${s.score} pts</div>
      </div>`).join("");
    showView("pw-round-view");
  });
})();
