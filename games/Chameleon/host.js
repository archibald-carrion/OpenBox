// socket is provided by the host shell
(() => {
  function $(id) { return document.getElementById(id); }

  let currentPlayers  = 0;
  let secretWordIndex = -1;  // tracked for end-of-round reveal only

  function showPanel(id) {
    ["ch-grid-picker","ch-game-panel","ch-reveal-panel","ch-guess-panel","ch-result-panel"]
      .forEach(p => $(p).style.display = p === id ? "block" : "none");
  }

  // ── Grid picker ────────────────────────────────────────────────────────────
  socket.on("chameleon:grid_list", ({ grids, currentGrid }) => {
    showPanel("ch-grid-picker");

    $("ch-grid-options").innerHTML = grids.map(g => `
      <button class="ch-grid-btn ${g === currentGrid ? 'selected' : ''}" data-grid="${g}">
        ${g}
      </button>`).join("");

    document.querySelectorAll(".ch-grid-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".ch-grid-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        socket.emit("host:action", { type: "pick_grid", grid: btn.dataset.grid });
      };
    });
  });

  // ── Round start ────────────────────────────────────────────────────────────
  socket.on("chameleon:round_start", ({ words, clueOrder, playerCount }) => {
    currentPlayers = playerCount;
    secretWordIndex = -1;  // reset — will be revealed at end

    $("ch-word-grid").innerHTML = words.map(w =>
      `<div class="ch-word-cell">${w}</div>`
    ).join("");

    renderClues(clueOrder.map(name => ({ name, clue: null })));

    $("ch-clue-box").style.display  = "";
    $("ch-vote-box").style.display  = "none";
    $("ch-phase-label").textContent = "💬 Clue Phase";

    showPanel("ch-game-panel");
  });

  // ── Clue updates ───────────────────────────────────────────────────────────
  socket.on("chameleon:clue_update", ({ clues }) => {
    renderClues(clues);
  });

  function renderClues(clues) {
    $("ch-clue-list").innerHTML = clues.map(c => `
      <div class="ch-clue-row">
        <span class="ch-clue-name">${c.name}</span>
        <span class="ch-clue-word ${c.clue ? '' : 'pending'}">${c.clue ?? '…'}</span>
      </div>`).join("");
  }

  // ── Vote phase ────────────────────────────────────────────────────────────
  socket.on("chameleon:vote_phase", ({ clues }) => {
    renderClues(clues);
    $("ch-vote-box").style.display  = "";
    $("ch-phase-label").textContent = "🗳️ Vote Phase";
    $("ch-vote-bar").style.width    = "0%";
    $("ch-vote-count").textContent  = `0 / ${currentPlayers} voted`;
  });

  socket.on("chameleon:vote_progress", ({ voted, total }) => {
    $("ch-vote-bar").style.width   = `${(voted / total) * 100}%`;
    $("ch-vote-count").textContent = `${voted} / ${total} voted`;
  });

  // ── Vote reveal ───────────────────────────────────────────────────────────
  socket.on("chameleon:reveal_votes", ({ tally, accused, caughtRight, votes }) => {
    const maxVotes = tally[0]?.count || 1;

    $("ch-tally-list").innerHTML = tally.map(t => `
      <div class="ch-tally-row">
        <span style="width:110px;flex-shrink:0" class="${accused.includes(t.name) ? 'ch-accused' : ''}">${t.name}</span>
        <div class="ch-tally-bar-wrap">
          <div class="ch-tally-bar" style="width:${(t.count / maxVotes) * 100}%;
            background:${accused.includes(t.name) ? 'var(--pink)' : 'var(--accent)'}"></div>
        </div>
        <span style="width:30px;text-align:right">${t.count}</span>
      </div>`).join("");

    $("ch-vote-detail").innerHTML = votes.map(v =>
      `<div class="ch-clue-row">
        <span class="ch-clue-name">${v.voter}</span>
        <span class="ch-clue-word">→ ${v.target}</span>
      </div>`).join("");

    $("ch-accused-label").innerHTML = !accused.length
      ? `🤝 <strong style="color:var(--muted)">No majority — the Chameleon escapes!</strong>`
      : caughtRight
      ? `☝️ <strong style="color:var(--pink)">${accusedNames.join(", ")}</strong> is accused — that's the Chameleon!`
      : `☝️ <strong style="color:var(--yellow)">${accusedNames.join(", ")}</strong> is accused — but they're NOT the Chameleon…`;

    showPanel("ch-reveal-panel");
  });

  // ── Chameleon guess phase ─────────────────────────────────────────────────
  socket.on("chameleon:guess_phase", ({ chameleonName }) => {
    $("ch-guess-spotlight").textContent = `🦎 ${chameleonName}`;
    $("ch-guess-waiting").textContent   = "🤔";
    showPanel("ch-guess-panel");
  });

  socket.on("chameleon:chameleon_guessed", ({ guess, correct }) => {
    $("ch-guess-waiting").innerHTML = correct
      ? `✅ <span style="color:var(--green);font-family:'Fredoka One',cursive;font-size:1.4rem">"${guess}" — Correct! Chameleon escapes!</span>`
      : `❌ <span style="color:var(--pink);font-family:'Fredoka One',cursive;font-size:1.4rem">"${guess}" — Wrong!</span>`;
  });

  // ── Round result ──────────────────────────────────────────────────────────
  socket.on("chameleon:round_result", ({ winner, chameleonName, secretWord, secretWordIndex: idx }) => {
    const el = $("ch-result-winner");
    if (winner === "chameleon") {
      el.textContent = "🦎 Chameleon Wins!";
      el.className   = "ch-result-winner chameleon";
    } else {
      el.textContent = "🎉 Players Win!";
      el.className   = "ch-result-winner players";
    }

    $("ch-result-detail-1").textContent = `The Chameleon was: ${chameleonName}`;
    $("ch-result-detail-2").textContent = `The secret word was: ${secretWord}`;

    // Now safe to highlight the secret word on the grid
    document.querySelectorAll(".ch-word-cell").forEach((cell, i) => {
      if (i === idx) cell.classList.add("secret");
    });

    showPanel("ch-result-panel");
  });
})();