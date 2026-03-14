// socket is provided by the player shell
(() => {
  function $(id) { return document.getElementById(id); }

  function showView(id) {
    ["pw-write-view","pw-vote-view","pw-wait-view","pw-scores-view"]
      .forEach(v => $(v).style.display = v === id ? "" : "none");
  }

  function wait(emoji, msg, sub) {
    showView("pw-wait-view");
    $("pw-wait-emoji").textContent = emoji;
    $("pw-wait-msg").textContent   = msg;
    $("pw-wait-sub").textContent   = sub ?? "";
  }

  // ── Writing phase ─────────────────────────────────────────────────────────
  // Player receives all their prompts at once, answers them one by one
  let myPrompts    = [];  // [{ pairId, prompt }]
  let currentIndex = 0;

  socket.on("promptwar:your_prompts", ({ prompts, timeLimit }) => {
    myPrompts    = prompts;
    currentIndex = 0;
    showCurrentPrompt(timeLimit);
  });

  function showCurrentPrompt(timeLimit) {
    if (currentIndex >= myPrompts.length) {
      wait("✅", "All answers submitted!", "Waiting for others…");
      return;
    }

    const { prompt } = myPrompts[currentIndex];
    const remaining  = myPrompts.length - currentIndex;

    $("pw-round-label").textContent = remaining > 1
      ? `Prompt ${currentIndex + 1} of ${myPrompts.length} — make it funny!`
      : `Last prompt — make it count!`;
    $("pw-my-prompt").textContent   = prompt;
    $("pw-answer-input").value      = "";
    $("pw-answer-input").disabled   = false;
    $("pw-submit-btn").disabled     = false;
    $("pw-answer-sent").textContent = "";
    showView("pw-write-view");
    $("pw-answer-input").focus();
  }

  $("pw-submit-btn").onclick = submitAnswer;
  $("pw-answer-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAnswer(); }
  });

  function submitAnswer() {
    const text = $("pw-answer-input").value.trim();
    if (!text) return;
    $("pw-answer-input").disabled = true;
    $("pw-submit-btn").disabled   = true;

    const { pairId } = myPrompts[currentIndex];
    socket.emit("player:action", { type: "answer", pairId, text });
  }

  socket.on("promptwar:answer_ack", ({ pairId }) => {
    // Move to the next prompt
    currentIndex++;
    if (currentIndex < myPrompts.length) {
      $("pw-answer-sent").textContent = "Submitted! Next prompt:";
      setTimeout(() => showCurrentPrompt(), 600);
    } else {
      wait("✅", "All done!", "Waiting for everyone else…");
    }
  });

  socket.on("promptwar:judge_mode", () => {
    wait("🧑‍⚖️", "You are the Judge!", "Watch others write, then vote on every battle.");
  });

  // ── Voting phase ─────────────────────────────────────────────────────────
  socket.on("promptwar:you_are_contender", ({ prompt, your_answer }) => {
    wait("🥊", "Your answer is in the ring!", `"${your_answer}"`);
  });

  socket.on("promptwar:vote_matchup", ({ prompt, slots }) => {
    $("pw-vote-prompt-text").textContent = prompt;
    $("pw-vote-sent").textContent        = "";

    $("pw-vote-options").innerHTML = slots.map(s => `
      <button class="pw-vote-option" data-slot="${s.slot}">
        <span class="pw-vote-letter">${s.slot}</span>
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

  socket.on("promptwar:matchup_result_player", ({ result }) => {
    const winner = result[0];
    if (winner?.votes > 0) {
      wait("😂", `${winner.name} wins!`, `"${winner.answer}"`);
    } else {
      wait("🤝", "It's a draw!", "");
    }
  });

  // ── Final scores ──────────────────────────────────────────────────────────
  function showScores(scores) {
    $("pw-scores-list").innerHTML = scores.map((s, i) => `
      <div class="pw-score-row">
        <span>${["🥇","🥈","🥉"][i] ?? "#"+(i+1)} ${s.name}</span>
        <span>${s.score} pts</span>
      </div>`).join("");
    showView("pw-scores-view");
  }

  socket.on("promptwar:gameover_player", ({ scores }) => showScores(scores));
  socket.on("promptwar:gameover",        ({ scores }) => showScores(scores));
})();