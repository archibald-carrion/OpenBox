// socket is provided by the player shell
(() => {
  function $(id) { return document.getElementById(id); }

  let isChameleon   = false;
  let secretWord    = null;
  let selectedGuess = null;

  function showView(id) {
    ["ch-wait-view","ch-role-view","ch-clue-view","ch-vote-view",
     "ch-chameleon-guess-view","ch-between-view"]
      .forEach(v => $(v).style.display = v === id ? "" : "none");
  }

  function wait(emoji, msg, sub) {
    showView("ch-wait-view");
    $("ch-wait-emoji").textContent = emoji;
    $("ch-wait-msg").textContent   = msg;
    $("ch-wait-sub").textContent   = sub ?? "";
  }

  function between(emoji, msg) {
    showView("ch-between-view");
    $("ch-between-emoji").textContent = emoji;
    $("ch-between-msg").textContent   = msg;
  }

  // Initial wait
  socket.on("chameleon:waiting", ({ message }) => {
    wait("🦎", "The Chameleon", message);
  });

  // Role reveal
  socket.on("chameleon:your_role", ({ isChameleon: ic, secretWord: sw, words }) => {
    isChameleon = ic;
    secretWord  = sw;

    const card = $("ch-role-card");
    card.className = `ch-role-card ${ic ? "chameleon" : "innocent"}`;

    if (ic) {
      $("ch-role-icon").textContent   = "🦎";
      $("ch-role-name").textContent   = "You are the Chameleon!";
      $("ch-role-sub").textContent    = "Blend in — you don't know the secret word!";
      $("ch-secret-reveal").innerHTML = "";
      $("ch-chameleon-grid").style.display = "";
      $("ch-p-grid-display").innerHTML = words.map(w =>
        `<div class="ch-p-grid-cell">${w}</div>`).join("");
    } else {
      $("ch-role-icon").textContent   = "🕵️";
      $("ch-role-name").textContent   = "You are NOT the Chameleon";
      $("ch-role-sub").textContent    = "The secret word is:";
      $("ch-secret-reveal").innerHTML = `<div class="ch-secret-word">${sw}</div>`;
      $("ch-chameleon-grid").style.display = "none";
    }

    showView("ch-role-view");
  });

  $("ch-ready-btn").onclick = () => {
    $("ch-clue-heading").textContent = isChameleon
      ? "Give one clue word (blend in!)"
      : `Secret word: "${secretWord}" - give a subtle clue`;
    $("ch-clue-hint").textContent = isChameleon
      ? "You don't know the secret word - be vague but convincing!"
      : "One word only. Don't make it too obvious!";
    $("ch-clue-sent").textContent  = "";
    $("ch-clue-input").value       = "";
    $("ch-clue-input").disabled    = false;
    $("ch-clue-submit").disabled   = false;
    showView("ch-clue-view");
  };

  // Clue submission
  $("ch-clue-submit").onclick = submitClue;
  $("ch-clue-input").addEventListener("keydown", e => { if (e.key === "Enter") submitClue(); });

  function submitClue() {
    const text = $("ch-clue-input").value.trim();
    if (!text) return;
    $("ch-clue-submit").disabled  = true;
    $("ch-clue-input").disabled   = true;
    $("ch-clue-sent").textContent = `Clue submitted: "${text}"`;
    socket.emit("player:action", { type: "clue", text });
  }

  // Vote phase
  socket.on("chameleon:vote_ballot", ({ candidates }) => {
    showView("ch-vote-view");
    $("ch-vote-sent").textContent = "";
    $("ch-ballot-list").innerHTML = candidates.map(c =>
      `<button class="ch-candidate-btn" data-id="${c.id}">${c.name}</button>`
    ).join("");

    document.querySelectorAll(".ch-candidate-btn").forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        document.querySelectorAll(".ch-candidate-btn").forEach(b => {
          b.classList.remove("selected");
          b.disabled = false;
        });
        btn.classList.add("selected");
        document.querySelectorAll(".ch-candidate-btn").forEach(b => b.disabled = true);
        $("ch-vote-sent").textContent = `Voted for ${btn.textContent.trim()}`;
        socket.emit("player:action", { type: "vote", targetId: btn.dataset.id });
      };
    });
  });

  // Vote result - announce the chameleon loudly if caught
  socket.on("chameleon:vote_result", ({ accused, caughtRight, chameleonName }) => {
    if (!accused.length) {
      between("🤝", "No majority - nobody accused!");
    } else if (caughtRight) {
      between("🦎", `${chameleonName} IS THE CHAMELEON!`);
    } else {
      between("😈", `${accused.join(", ")} is accused - but innocent!`);
    }
  });

  // Chameleon guess view - only sent to the chameleon's phone by the server
  socket.on("chameleon:you_must_guess", ({ words }) => {
    selectedGuess = null;
    $("ch-guess-confirm").textContent = "";
    $("ch-guess-grid").innerHTML = words.map(w =>
      `<div class="ch-p-grid-cell" data-word="${w}">${w}</div>`
    ).join("");

    document.querySelectorAll("#ch-guess-grid .ch-p-grid-cell").forEach(cell => {
      cell.onclick = () => {
        if (cell.classList.contains("confirmed")) return;

        if (!cell.classList.contains("selected")) {
          document.querySelectorAll("#ch-guess-grid .ch-p-grid-cell")
            .forEach(c => c.classList.remove("selected"));
          cell.classList.add("selected");
          selectedGuess = cell.dataset.word;
          $("ch-guess-confirm").textContent = `Tap again to confirm: "${selectedGuess}"`;
          return;
        }

        cell.classList.add("confirmed");
        document.querySelectorAll("#ch-guess-grid .ch-p-grid-cell").forEach(c => {
          c.classList.remove("selected");
          c.style.pointerEvents = "none";
        });
        $("ch-guess-confirm").textContent = `You guessed: "${selectedGuess}"`;
        socket.emit("player:action", { type: "chameleon_guess", word: selectedGuess });
      };
    });

    showView("ch-chameleon-guess-view");
  });

  // Only the chameleon receives this - others get chameleon:waiting from the server
  socket.on("chameleon:chameleon_guessed", ({ guess, correct }) => {
    between(
      correct ? "😅" : "😵",
      correct ? `"${guess}" - Correct! You escape!` : `"${guess}" - Wrong!`
    );
  });

  // Round result
  socket.on("chameleon:round_result", ({ winner, chameleonName }) => {
    if (winner === "chameleon") {
      between("🦎", isChameleon ? "You win! They didn't catch you!" : `${chameleonName} escaped!`);
    } else {
      between("🎉", isChameleon ? "You were caught!" : `You caught ${chameleonName}!`);
    }
  });
})();