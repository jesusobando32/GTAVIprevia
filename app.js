// Lógica principal de la aplicación multipágina: Previa de Lanzamiento de GTA VI

(function () {
  "use strict";

  const STORAGE_KEY = "gta6_previa_state_v1";
  const QUESTION_TIME_MS = 20000; // 20 segundos para bonus de rapidez
  const BINGO_LETTERS_5 = ["L", "E", "O", "N", "I"];
  const BINGO_LETTERS_4 = ["V", "I", "C", "E"];

  // Estado global persistido
  let state = loadState();

  // Estado efímero de la partida de trivia en curso
  let activeQuiz = {
    isPlaying: false,
    playerName: "",
    currentIndex: 0,
    score: 0,
    correctCount: 0,
    bonusScore: 0,
    streak: 0,
    maxStreak: 0,
    answered: false,
    questionStartTime: 0,
    timerInterval: null,
    totalElapsedMs: 0
  };

  // Estado efímero del reloj y modales
  let simulateMidnightMode = false;
  let editingBingoCellIndex = null;
  let activeTheaterVideoId = null;
  let toastTimeout = null;
  let bingoCardsViewMode = window.innerWidth <= 720;

  // =========================================================================
  // 1. INICIALIZACIÓN Y PERSISTENCIA (LOCALSTORAGE)
  // =========================================================================
  function createDefaultBingoBoard(size, customPool) {
    const pool = [...window.GTA_PREVIA_DATA.defaultBingoPredictions, ...(customPool || [])];
    const shuffled = shuffleArray(pool);
    const totalCells = size * size;
    const centerIndex = size === 5 ? 12 : -1;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      if (i === centerIndex) {
        cells.push({
          text: "★ VICE CITY 00:00 (CASILLA LIBRE)",
          marked: true,
          isFree: true
        });
      } else {
        cells.push({
          text: shuffled[i % shuffled.length],
          marked: false,
          isFree: false
        });
      }
    }
    return {
      size: size,
      cells: cells,
      lastLineCount: 0
    };
  }

  function getInitialState() {
    const defaultSize = 5;
    return {
      activeView: "hype",
      triviaLeaderboard: [],
      bingo: {
        activeOwner: "general",
        customPool: [],
        cards: {
          general: createDefaultBingoBoard(defaultSize, []),
          amigo1: createDefaultBingoBoard(defaultSize, []),
          amigo2: createDefaultBingoBoard(defaultSize, []),
          amigo3: createDefaultBingoBoard(defaultSize, []),
          amigo4: createDefaultBingoBoard(defaultSize, [])
        }
      },
      watchedVideos: {},
      checklist: JSON.parse(JSON.stringify(window.GTA_PREVIA_DATA.defaultChecklist))
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getInitialState();
      const parsed = JSON.parse(raw);
      const base = getInitialState();

      return {
        activeView: parsed.activeView || base.activeView,
        triviaLeaderboard: Array.isArray(parsed.triviaLeaderboard) ? parsed.triviaLeaderboard : [],
        bingo: {
          activeOwner: parsed.bingo?.activeOwner || "general",
          customPool: Array.isArray(parsed.bingo?.customPool) ? parsed.bingo.customPool : [],
          cards: {
            ...base.bingo.cards,
            ...(parsed.bingo?.cards || {})
          }
        },
        watchedVideos: parsed.watchedVideos && typeof parsed.watchedVideos === "object" ? parsed.watchedVideos : {},
        checklist: {
          console: Array.isArray(parsed.checklist?.console) ? parsed.checklist.console : base.checklist.console,
          snacks: Array.isArray(parsed.checklist?.snacks) ? parsed.checklist.snacks : base.checklist.snacks
        }
      };
    } catch (err) {
      console.warn("No se pudo leer localStorage, usando estado inicial:", err);
      return getInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("No se pudo guardar en localStorage:", err);
    }
    updateGlobalBadgesAndSummary();
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function showToast(message) {
    const toast = document.getElementById("app-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  // =========================================================================
  // 2. NAVEGACIÓN MULTIPÁGINA (4 VISTAS SEPARADAS)
  // =========================================================================
  const VALID_VIEWS = ["hype", "trivia", "bingo", "checklist"];

  function switchView(viewName, updateHash = true) {
    const target = VALID_VIEWS.includes(viewName) ? viewName : "hype";
    state.activeView = target;
    saveState();

    // Mostrar solo la sección activa y ocultar las demás
    VALID_VIEWS.forEach((v) => {
      const section = document.getElementById(`view-${v}`);
      if (section) {
        const isCurrent = v === target;
        section.hidden = !isCurrent;
        section.classList.toggle("is-active", isCurrent);
      }
    });

    // Actualizar pestañas de la barra de navegación fija
    document.querySelectorAll("[data-nav-btn]").forEach((btn) => {
      const btnView = btn.getAttribute("data-nav-btn");
      const isCurrent = btnView === target;
      btn.classList.toggle("is-active", isCurrent);
      if (isCurrent) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    if (updateHash) {
      history.replaceState(null, "", `#${target}`);
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function initNavigation() {
    document.querySelectorAll("[data-nav-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-nav-btn");
        switchView(target, true);
      });
    });

    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = link.getAttribute("data-nav-link");
        switchView(target, true);
      });
    });

    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-goto");
        switchView(target, true);
      });
    });

    window.addEventListener("hashchange", () => {
      const hashView = window.location.hash.replace("#", "").trim();
      if (VALID_VIEWS.includes(hashView)) {
        switchView(hashView, false);
      }
    });

    const initialHash = window.location.hash.replace("#", "").trim();
    if (VALID_VIEWS.includes(initialHash)) {
      switchView(initialHash, false);
    } else {
      switchView(state.activeView || "hype", true);
    }
  }

  // =========================================================================
  // 3. PÁGINA 1: CUENTA REGRESIVA EN TIEMPO REAL HASTA LAS 00:00
  // =========================================================================
  function updateCountdown() {
    const hoursEl = document.getElementById("cd-hours");
    const minutesEl = document.getElementById("cd-minutes");
    const secondsEl = document.getElementById("cd-seconds");
    const navClockEl = document.getElementById("nav-countdown-text");
    const statusMsgEl = document.getElementById("countdown-status-msg");
    const progressBarEl = document.getElementById("cd-progress-bar");
    const percentLabelEl = document.getElementById("cd-percent-label");

    if (simulateMidnightMode) {
      hoursEl.textContent = "00";
      minutesEl.textContent = "00";
      secondsEl.textContent = "00";
      navClockEl.textContent = "¡00:00 YA!";
      statusMsgEl.textContent = "¡MEDIANOCHE ALCANZADA! GTA VI YA ESTÁ DESBLOQUEADO EN LEONIDA.";
      progressBarEl.style.width = "100%";
      percentLabelEl.textContent = "100% • ¡Hora de entrar a Vice City!";
      return;
    }

    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Próxima medianoche 00:00:00

    const diffMs = Math.max(0, midnight.getTime() - now.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const hStr = String(hrs).padStart(2, "0");
    const mStr = String(mins).padStart(2, "0");
    const sStr = String(secs).padStart(2, "0");

    hoursEl.textContent = hStr;
    minutesEl.textContent = mStr;
    secondsEl.textContent = sStr;
    navClockEl.textContent = `${hStr}:${mStr}:${sStr}`;

    // Calcular porcentaje tomando una ventana de previa de 6 horas (18:00 a 00:00) o del día
    const sixHoursMs = 6 * 3600 * 1000;
    const elapsedInWindow = Math.max(0, sixHoursMs - Math.min(diffMs, sixHoursMs));
    const pct = Math.min(100, Math.round((elapsedInWindow / sixHoursMs) * 100));

    progressBarEl.style.width = `${pct}%`;
    percentLabelEl.textContent = `${pct}% de la ventana de previa completada`;
    statusMsgEl.textContent = `Faltan ${hrs}h ${mins}m ${secs}s para que den las 00:00 y arranque Grand Theft Auto VI.`;
  }

  function initCountdown() {
    const simBtn = document.getElementById("btn-simulate-midnight");
    if (simBtn) {
      simBtn.addEventListener("click", () => {
        simulateMidnightMode = !simulateMidnightMode;
        simBtn.textContent = simulateMidnightMode ? "Volver a Hora Real" : "Simular 00:00";
        updateCountdown();
        if (simulateMidnightMode) {
          showToast("⚡ ¡Simulación de las 00:00 activada! Bienvenidos a Leonida.");
        }
      });
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // =========================================================================
  // 4. PÁGINA 2: TRIVIA CON REGISTRO, 6.000 PTS, WANTED LEVEL Y RANKING
  // =========================================================================
  const MAX_TRIVIA_POINTS = 6000;

  function formatPoints(num) {
    return Number(num || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function getWantedLevelInfo(score) {
    const cleanScore = Math.max(0, Number(score || 0));
    const stars = Math.min(6, Math.floor(cleanScore / 1000));
    const filled = "★".repeat(stars);
    const empty = "☆".repeat(6 - stars);
    const meter = filled + empty;

    let rankNote = "";
    let shortDisplay = "";

    if (stars === 0) {
      rankNote = "0 estrellas (Ciudadano ejemplar)";
      shortDisplay = "0 ★ (Ciudadano ejemplar)";
    } else if (stars === 6) {
      rankNote = "★★★★★★ (Nivel Ejército)";
      shortDisplay = "★★★★★★ (Nivel Ejército)";
    } else {
      rankNote = `${filled} (${stars} ${stars === 1 ? "estrella" : "estrellas"})`;
      shortDisplay = `${filled} (${stars} ★)`;
    }

    return {
      stars,
      filled,
      meter,
      rankNote,
      shortDisplay
    };
  }

  function getDifficultyBadgeClass(dificultad) {
    const norm = String(dificultad || "").toLowerCase();
    if (norm.includes("fácil") || norm.includes("facil")) return "badge badge--easy";
    if (norm.includes("difícil") || norm.includes("dificil")) return "badge badge--hard";
    return "badge badge--medium";
  }

  function getSortedLeaderboard() {
    return [...state.triviaLeaderboard].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.correctCount || 0) - (a.correctCount || 0);
    });
  }

  function renderLeaderboardInto(containerId, highlightPlayerName = "") {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sorted = getSortedLeaderboard();
    if (sorted.length === 0) {
      container.innerHTML = `
        <div class="leaderboard-empty">
          <strong>Aún no hay puntajes registrados esta noche.</strong>
          <p style="margin-top:0.35rem;">Registra al primer jugador a la izquierda para inaugurar la Tabla de Posiciones del grupo (1.º a 4.º lugar).</p>
        </div>
      `;
      return;
    }

    const totalQuestions = window.GTA_PREVIA_DATA.triviaQuestions.length;
    const rankLabels = ["1.º 🥇", "2.º 🥈", "3.º 🥉", "4.º"];

    container.innerHTML = sorted
      .map((entry, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankLabels[idx] || `${rankNum}.º`;
        const rankClass = rankNum <= 3 ? `is-rank-${rankNum}` : "";
        const isHighlighted =
          highlightPlayerName &&
          entry.name.trim().toLowerCase() === highlightPlayerName.trim().toLowerCase()
            ? "is-current-player"
            : "";

        const wanted = getWantedLevelInfo(entry.score);

        return `
          <div class="leaderboard-row ${rankClass} ${isHighlighted}">
            <div class="lb-left">
              <span class="lb-rank-badge">${rankLabel}</span>
              <div class="lb-player-info">
                <span class="lb-player-name">${escapeHtml(entry.name)}</span>
                <span class="lb-player-meta">
                  <strong class="lb-wanted-stars" title="Nivel de Búsqueda: ${escapeHtml(wanted.rankNote)}">${wanted.meter}</strong>
                  • ${escapeHtml(wanted.shortDisplay)} • ${entry.correctCount}/${totalQuestions} aciertos
                </span>
              </div>
            </div>
            <div class="lb-right">
              <div class="lb-score-box">
                <span class="lb-score-val">${formatPoints(entry.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts</span>
                <span class="lb-score-sub">${wanted.stars} / 6 ★ Búsqueda</span>
              </div>
              <button
                type="button"
                class="btn-icon"
                data-delete-player="${escapeHtml(entry.name)}"
                title="Eliminar registro de ${escapeHtml(entry.name)}"
                aria-label="Eliminar registro de ${escapeHtml(entry.name)}"
              >
                ✕
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll("[data-delete-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nameToDelete = btn.getAttribute("data-delete-player");
        state.triviaLeaderboard = state.triviaLeaderboard.filter(
          (p) => p.name.trim().toLowerCase() !== nameToDelete.trim().toLowerCase()
        );
        saveState();
        renderAllLeaderboards();
        showToast(`Registro de ${nameToDelete} eliminado del ranking.`);
      });
    });
  }

  function renderAllLeaderboards(highlightPlayerName = "") {
    renderLeaderboardInto("leaderboard-container", highlightPlayerName);
    renderLeaderboardInto("result-leaderboard-container", highlightPlayerName);
    renderQuickPlayerChips();
  }

  function renderQuickPlayerChips() {
    const chipsContainer = document.getElementById("trivia-quick-players");
    if (!chipsContainer) return;

    const defaultSlots = ["Amigo 1", "Amigo 2", "Amigo 3", "Amigo 4"];
    const registeredNames = state.triviaLeaderboard.map((p) => p.name);
    const combined = [...new Set([...registeredNames, ...defaultSlots])].slice(0, 6);

    chipsContainer.innerHTML = combined
      .map((name) => {
        const hasPlayed = registeredNames.some(
          (r) => r.trim().toLowerCase() === name.trim().toLowerCase()
        );
        return `
          <button type="button" class="chip-btn" data-fill-player="${escapeHtml(name)}">
            ${escapeHtml(name)} ${hasPlayed ? "✓" : ""}
          </button>
        `;
      })
      .join("");

    chipsContainer.querySelectorAll("[data-fill-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById("trivia-player-name");
        if (input) {
          input.value = btn.getAttribute("data-fill-player");
          input.focus();
        }
      });
    });
  }

  function startTriviaForPlayer(playerName) {
    const cleanName = playerName.trim();
    if (!cleanName) return;

    activeQuiz = {
      isPlaying: true,
      playerName: cleanName,
      currentIndex: 0,
      score: 0,
      correctCount: 0,
      answered: false
    };

    document.getElementById("trivia-lobby-panel").hidden = true;
    document.getElementById("trivia-result-panel").hidden = true;
    document.getElementById("trivia-play-panel").hidden = false;
    document.getElementById("btn-trivia-show-lobby").hidden = false;

    renderCurrentTriviaQuestion();
  }

  function renderCurrentTriviaQuestion() {
    const questions = window.GTA_PREVIA_DATA.triviaQuestions;
    const q = questions[activeQuiz.currentIndex];
    if (!q) return;

    activeQuiz.answered = false;

    const categoria = q.categoria || q.category || "Saga GTA";
    const dificultad = q.dificultad || "Media";
    const puntos = Number(q.puntos || 300);
    const preguntaText = q.pregunta || q.question || "";
    const opciones = q.opciones || q.options || [];
    const wanted = getWantedLevelInfo(activeQuiz.score);

    document.getElementById("quiz-active-player").textContent = activeQuiz.playerName;
    document.getElementById("quiz-progress-text").textContent = `${activeQuiz.currentIndex + 1} / ${questions.length}`;
    document.getElementById("quiz-live-score").textContent = `${formatPoints(activeQuiz.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts`;

    const liveStarsEl = document.getElementById("quiz-live-stars");
    if (liveStarsEl) {
      liveStarsEl.textContent = wanted.meter;
      liveStarsEl.title = wanted.rankNote;
    }

    document.getElementById("quiz-category-badge").textContent = categoria;

    const diffBadge = document.getElementById("quiz-difficulty-badge");
    if (diffBadge) {
      diffBadge.textContent = `Dificultad: ${dificultad}`;
      diffBadge.className = getDifficultyBadgeClass(dificultad);
    }

    const ptsBadge = document.getElementById("quiz-points-badge");
    if (ptsBadge) {
      ptsBadge.textContent = `Valor: ${puntos} pts`;
    }

    document.getElementById("quiz-question-text").textContent = preguntaText;

    const progressPct = (((activeQuiz.currentIndex + 1) / questions.length) * 100).toFixed(1);
    document.getElementById("quiz-question-bar").style.width = `${progressPct}%`;

    // Ocultar feedback anterior
    const feedbackBox = document.getElementById("quiz-feedback-box");
    feedbackBox.hidden = true;

    // Renderizar opciones A, B, C, D
    const letters = ["A", "B", "C", "D"];
    const optionsList = document.getElementById("quiz-options-list");
    optionsList.innerHTML = opciones
      .map(
        (optText, idx) => `
        <button type="button" class="quiz-option-btn" data-opt-index="${idx}">
          <span class="quiz-option-letter">${letters[idx]}</span>
          <span class="quiz-option-text">${escapeHtml(optText)}</span>
        </button>
      `
      )
      .join("");

    optionsList.querySelectorAll(".quiz-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosenIdx = Number(btn.getAttribute("data-opt-index"));
        handleTriviaAnswer(chosenIdx);
      });
    });
  }

  function handleTriviaAnswer(chosenIdx) {
    if (activeQuiz.answered) return;
    activeQuiz.answered = true;

    const questions = window.GTA_PREVIA_DATA.triviaQuestions;
    const q = questions[activeQuiz.currentIndex];
    const correctIndex = typeof q.respuestaCorrecta === "number" ? q.respuestaCorrecta : q.correctIndex;
    const puntos = Number(q.puntos || 300);
    const explicacion = q.explicacion || q.explanation || "";
    const isCorrect = chosenIdx === correctIndex;

    if (isCorrect) {
      activeQuiz.correctCount += 1;
      activeQuiz.score += puntos;
    }

    // Marcar visualmente los botones
    document.querySelectorAll("#quiz-options-list .quiz-option-btn").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-opt-index"));
      btn.disabled = true;
      if (idx === correctIndex) {
        btn.classList.add("is-correct");
      } else if (idx === chosenIdx && !isCorrect) {
        btn.classList.add("is-wrong");
      }
    });

    // Actualizar marcadores superiores (puntaje y estrellas)
    const wanted = getWantedLevelInfo(activeQuiz.score);
    document.getElementById("quiz-live-score").textContent = `${formatPoints(activeQuiz.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts`;
    const liveStarsEl = document.getElementById("quiz-live-stars");
    if (liveStarsEl) {
      liveStarsEl.textContent = wanted.meter;
      liveStarsEl.title = wanted.rankNote;
    }

    // Mostrar panel de explicación
    const feedbackBox = document.getElementById("quiz-feedback-box");
    const feedbackBadge = document.getElementById("quiz-feedback-badge");
    const feedbackPoints = document.getElementById("quiz-feedback-points");
    const feedbackExplanation = document.getElementById("quiz-feedback-explanation");
    const nextBtn = document.getElementById("btn-quiz-next");

    if (isCorrect) {
      feedbackBadge.textContent = "¡RESPUESTA CORRECTA!";
      feedbackBadge.className = "quiz-feedback-badge is-win";
      feedbackPoints.textContent = `+${puntos} pts (${q.dificultad}) • Total: ${formatPoints(activeQuiz.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts`;
    } else {
      feedbackBadge.textContent = "RESPUESTA INCORRECTA";
      feedbackBadge.className = "quiz-feedback-badge is-loss";
      feedbackPoints.textContent = `+0 pts (valía ${puntos} pts)`;
    }

    feedbackExplanation.textContent = explicacion;

    const isLastQuestion = activeQuiz.currentIndex >= questions.length - 1;
    nextBtn.textContent = isLastQuestion
      ? "Finalizar y Ver Tabla de Posiciones →"
      : "Siguiente Pregunta →";

    feedbackBox.hidden = false;
    feedbackBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function finishTriviaAttempt() {
    activeQuiz.isPlaying = false;
    const wanted = getWantedLevelInfo(activeQuiz.score);

    const entry = {
      name: activeQuiz.playerName,
      score: activeQuiz.score,
      stars: wanted.stars,
      correctCount: activeQuiz.correctCount,
      playedAt: new Date().toISOString()
    };

    // Si ya existe un jugador con el mismo nombre, actualizamos su registro
    const existingIdx = state.triviaLeaderboard.findIndex(
      (p) => p.name.trim().toLowerCase() === entry.name.trim().toLowerCase()
    );
    if (existingIdx >= 0) {
      state.triviaLeaderboard[existingIdx] = entry;
    } else {
      state.triviaLeaderboard.push(entry);
    }

    saveState();

    // Calcular posición en el ranking ordenado
    const sorted = getSortedLeaderboard();
    const rankIndex = sorted.findIndex(
      (p) => p.name.trim().toLowerCase() === entry.name.trim().toLowerCase()
    );
    const rankPos = rankIndex >= 0 ? rankIndex + 1 : 1;
    const totalQuestions = window.GTA_PREVIA_DATA.triviaQuestions.length;

    document.getElementById("trivia-play-panel").hidden = true;
    document.getElementById("trivia-lobby-panel").hidden = true;
    document.getElementById("trivia-result-panel").hidden = false;
    document.getElementById("btn-trivia-show-lobby").hidden = false;

    document.getElementById("result-rank-badge").textContent = `PUESTO #${rankPos} DE ${sorted.length} EN EL GRUPO`;
    document.getElementById("result-title-text").textContent = `¡Turno completado, ${entry.name}!`;
    document.getElementById("result-subtitle-text").textContent =
      rankPos === 1
        ? `${entry.name} lidera la Previa de GTA VI con ${formatPoints(entry.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts y ${wanted.rankNote}.`
        : `${entry.name} quedó en ${rankPos}.º lugar con ${formatPoints(entry.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts y ${wanted.rankNote}. ¡Turno del siguiente amigo!`;

    document.getElementById("res-total-score").textContent = `${formatPoints(entry.score)} / ${formatPoints(MAX_TRIVIA_POINTS)} pts`;
    document.getElementById("res-wanted-stars").textContent = wanted.meter;
    document.getElementById("res-wanted-caption").textContent = wanted.rankNote;
    document.getElementById("res-correct-count").textContent = `${entry.correctCount} / ${totalQuestions}`;

    renderAllLeaderboards(entry.name);
    showToast(`🏆 ${entry.name}: ${formatPoints(entry.score)} / 6.000 pts (${wanted.shortDisplay}) guardado.`);
  }

  function showTriviaLobby(suggestNextFriend = false) {
    activeQuiz.isPlaying = false;

    document.getElementById("trivia-play-panel").hidden = true;
    document.getElementById("trivia-result-panel").hidden = true;
    document.getElementById("trivia-lobby-panel").hidden = false;
    document.getElementById("btn-trivia-show-lobby").hidden = true;

    renderAllLeaderboards();

    const input = document.getElementById("trivia-player-name");
    if (input) {
      if (suggestNextFriend) {
        const nextNum = state.triviaLeaderboard.length + 1;
        input.value = "";
        input.placeholder = `Nombre del Jugador #${nextNum} (ej. Amigo ${nextNum})...`;
      }
      input.focus();
    }
  }

  function initTrivia() {
    renderAllLeaderboards();

    const startForm = document.getElementById("trivia-start-form");
    startForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("trivia-player-name");
      if (!input || !input.value.trim()) return;
      startTriviaForPlayer(input.value);
    });

    document.getElementById("btn-quiz-next").addEventListener("click", () => {
      const total = window.GTA_PREVIA_DATA.triviaQuestions.length;
      if (activeQuiz.currentIndex < total - 1) {
        activeQuiz.currentIndex += 1;
        renderCurrentTriviaQuestion();
      } else {
        finishTriviaAttempt();
      }
    });

    document.getElementById("btn-next-friend-turn").addEventListener("click", () => {
      showTriviaLobby(true);
    });

    document.getElementById("btn-retry-same-player").addEventListener("click", () => {
      if (activeQuiz.playerName) {
        startTriviaForPlayer(activeQuiz.playerName);
      } else {
        showTriviaLobby(false);
      }
    });

    document.getElementById("btn-trivia-show-lobby").addEventListener("click", () => {
      showTriviaLobby(false);
    });

    document.getElementById("btn-clear-leaderboard").addEventListener("click", () => {
      if (state.triviaLeaderboard.length === 0) return;
      state.triviaLeaderboard = [];
      saveState();
      renderAllLeaderboards();
      showToast("Tabla de posiciones de Trivia reiniciada.");
    });
  }

  // =========================================================================
  // 5. PÁGINA 3: BINGO DE LEONIDA (5x5 / 4x4, BARAJAR, EDITAR, DETECCIÓN DE LÍNEA)
  // =========================================================================
  function getActiveBingoCard() {
    const owner = state.bingo.activeOwner || "general";
    if (!state.bingo.cards[owner]) {
      state.bingo.cards[owner] = createDefaultBingoBoard(5, state.bingo.customPool);
    }
    return state.bingo.cards[owner];
  }

  function getCellCoordinate(index, size) {
    const letters = size === 5 ? BINGO_LETTERS_5 : BINGO_LETTERS_4;
    const row = Math.floor(index / size) + 1;
    const col = index % size;
    return `${letters[col]}-${row}`;
  }

  function detectBingoLines(card) {
    const size = card.size;
    const cells = card.cells;
    const winningLines = [];
    const winningIndices = new Set();

    // Filas horizontales
    for (let r = 0; r < size; r++) {
      const rowIndices = [];
      let allMarked = true;
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        rowIndices.push(idx);
        if (!cells[idx]?.marked) allMarked = false;
      }
      if (allMarked) {
        winningLines.push(`Fila ${r + 1}`);
        rowIndices.forEach((i) => winningIndices.add(i));
      }
    }

    // Columnas verticales
    const letters = size === 5 ? BINGO_LETTERS_5 : BINGO_LETTERS_4;
    for (let c = 0; c < size; c++) {
      const colIndices = [];
      let allMarked = true;
      for (let r = 0; r < size; r++) {
        const idx = r * size + c;
        colIndices.push(idx);
        if (!cells[idx]?.marked) allMarked = false;
      }
      if (allMarked) {
        winningLines.push(`Columna ${letters[c]}`);
        colIndices.forEach((i) => winningIndices.add(i));
      }
    }

    // Diagonal principal (↘)
    const diag1 = [];
    let diag1Marked = true;
    for (let i = 0; i < size; i++) {
      const idx = i * size + i;
      diag1.push(idx);
      if (!cells[idx]?.marked) diag1Marked = false;
    }
    if (diag1Marked) {
      winningLines.push("Diagonal ↘");
      diag1.forEach((i) => winningIndices.add(i));
    }

    // Diagonal secundaria (↗)
    const diag2 = [];
    let diag2Marked = true;
    for (let i = 0; i < size; i++) {
      const idx = i * size + (size - 1 - i);
      diag2.push(idx);
      if (!cells[idx]?.marked) diag2Marked = false;
    }
    if (diag2Marked) {
      winningLines.push("Diagonal ↗");
      diag2.forEach((i) => winningIndices.add(i));
    }

    return { winningLines, winningIndices };
  }

  function renderBingoBoard() {
    const card = getActiveBingoCard();
    const size = card.size;
    const gridEl = document.getElementById("bingo-grid");
    const ownerSelect = document.getElementById("bingo-card-owner");
    const sizeSelect = document.getElementById("bingo-grid-size");

    if (ownerSelect) ownerSelect.value = state.bingo.activeOwner;
    if (sizeSelect) sizeSelect.value = String(size);

    gridEl.className = `bingo-grid bingo-grid--${size}${bingoCardsViewMode ? " is-cards-view" : ""}`;
    const viewModeBtn = document.getElementById("btn-bingo-view-mode");
    if (viewModeBtn) {
      viewModeBtn.textContent = bingoCardsViewMode
        ? `🔢 Ver Cuadrícula ${size}x${size}`
        : "📱 Vista Tarjetas";
    }

    const { winningLines, winningIndices } = detectBingoLines(card);
    const markedCount = card.cells.filter((c) => c.marked).length;
    const totalCells = card.cells.length;

    // Actualizar estadísticas del Bingo
    document.getElementById("bingo-stat-marked").textContent = `${markedCount} / ${totalCells}`;
    document.getElementById("bingo-stat-lines").textContent = `${winningLines.length}`;

    // Mostrar u ocultar banner automático de ¡BINGO!
    const winBanner = document.getElementById("bingo-win-banner");
    const winTitle = document.getElementById("bingo-win-title");
    const winDesc = document.getElementById("bingo-win-desc");
    const winBadges = document.getElementById("bingo-win-lines-list");

    if (winningLines.length > 0) {
      winBanner.hidden = false;
      const isFullHouse = markedCount === totalCells;
      winTitle.textContent = isFullHouse
        ? "¡¡CARTÓN LLENO EN LEONIDA (FULL BINGO)!!"
        : `¡BINGO EN LEONIDA! (${winningLines.length} ${winningLines.length === 1 ? "Línea" : "Líneas"})`;
      winDesc.textContent = isFullHouse
        ? "Se cumplieron absolutamente todas las predicciones del tablero esta noche."
        : "Predicciones cumplidas en línea recta durante las primeras horas jugando GTA VI.";
      winBadges.innerHTML = winningLines
        .map((line) => `<span class="badge badge--accent">${escapeHtml(line)}</span>`)
        .join("");
    } else {
      winBanner.hidden = true;
    }

    // Notificar si acaba de formar una nueva línea
    if (winningLines.length > (card.lastLineCount || 0)) {
      showToast(`🎯 ¡BINGO EN LEONIDA! Se completó: ${winningLines[winningLines.length - 1]}`);
    }
    card.lastLineCount = winningLines.length;

    // Renderizar casillas
    gridEl.innerHTML = card.cells
      .map((cell, idx) => {
        const coord = getCellCoordinate(idx, size);
        const isWinning = winningIndices.has(idx);
        const classes = [
          "bingo-cell",
          cell.marked ? "is-marked" : "",
          cell.isFree ? "is-free-center" : "",
          isWinning ? "is-winning-line" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div
            class="${classes}"
            role="gridcell"
            tabindex="0"
            aria-selected="${cell.marked ? "true" : "false"}"
            data-bingo-cell="${idx}"
          >
            <div class="bingo-cell-top">
              <span class="bingo-cell-coord">${coord}</span>
              <button
                type="button"
                class="bingo-cell-edit-btn"
                data-bingo-edit="${idx}"
                title="Editar predicción de la casilla ${coord}"
                aria-label="Editar predicción de la casilla ${coord}"
              >
                ✎
              </button>
            </div>
            <p class="bingo-cell-text">${escapeHtml(cell.text)}</p>
            <div class="bingo-cell-footer">
              <span>${cell.marked ? "✓ CUMPLIDO" : "Pendiente"}</span>
              ${isWinning ? "<span>★ BINGO</span>" : ""}
            </div>
          </div>
        `;
      })
      .join("");

    // Eventos de marcar/desmarcar y editar casilla
    gridEl.querySelectorAll("[data-bingo-cell]").forEach((cellEl) => {
      cellEl.addEventListener("click", (e) => {
        if (e.target.closest("[data-bingo-edit]")) return;
        const idx = Number(cellEl.getAttribute("data-bingo-cell"));
        toggleBingoCell(idx);
      });

      cellEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.target.closest("[data-bingo-edit]")) return;
          e.preventDefault();
          const idx = Number(cellEl.getAttribute("data-bingo-cell"));
          toggleBingoCell(idx);
        }
      });
    });

    gridEl.querySelectorAll("[data-bingo-edit]").forEach((editBtn) => {
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(editBtn.getAttribute("data-bingo-edit"));
        openBingoEditModal(idx);
      });
    });

    saveState();
  }

  function toggleBingoCell(index) {
    const card = getActiveBingoCard();
    if (!card.cells[index]) return;
    card.cells[index].marked = !card.cells[index].marked;
    renderBingoBoard();
  }

  function openBingoEditModal(index) {
    const card = getActiveBingoCard();
    const cell = card.cells[index];
    if (!cell) return;

    editingBingoCellIndex = index;
    const coord = getCellCoordinate(index, card.size);
    document.getElementById("bingo-edit-coord-label").textContent = `Predicción para la casilla ${coord}`;
    const textarea = document.getElementById("bingo-edit-input");
    textarea.value = cell.text;
    document.getElementById("bingo-edit-modal").hidden = false;
    textarea.focus();
  }

  function closeBingoEditModal() {
    editingBingoCellIndex = null;
    document.getElementById("bingo-edit-modal").hidden = true;
  }

  function initBingo() {
    renderBingoBoard();

    const viewModeBtn = document.getElementById("btn-bingo-view-mode");
    if (viewModeBtn) {
      viewModeBtn.addEventListener("click", () => {
        bingoCardsViewMode = !bingoCardsViewMode;
        renderBingoBoard();
      });
    }

    document.getElementById("bingo-card-owner").addEventListener("change", (e) => {
      state.bingo.activeOwner = e.target.value;
      renderBingoBoard();
      showToast("Cartón de Bingo cambiado.");
    });

    document.getElementById("bingo-grid-size").addEventListener("change", (e) => {
      const newSize = Number(e.target.value) === 4 ? 4 : 5;
      const owner = state.bingo.activeOwner;
      state.bingo.cards[owner] = createDefaultBingoBoard(newSize, state.bingo.customPool);
      renderBingoBoard();
      showToast(`Tablero cambiado a formato ${newSize}x${newSize}.`);
    });

    document.getElementById("btn-bingo-shuffle").addEventListener("click", () => {
      const card = getActiveBingoCard();
      const owner = state.bingo.activeOwner;
      state.bingo.cards[owner] = createDefaultBingoBoard(card.size, state.bingo.customPool);
      renderBingoBoard();
      showToast("🔀 Cartón barajado con nuevas predicciones de Leonida.");
    });

    document.getElementById("btn-bingo-clear-marks").addEventListener("click", () => {
      const card = getActiveBingoCard();
      card.cells.forEach((cell) => {
        cell.marked = Boolean(cell.isFree);
      });
      card.lastLineCount = 0;
      renderBingoBoard();
      showToast("Casillas del cartón desmarcadas.");
    });

    // Agregar predicción propia directamente al cartón activo
    document.getElementById("bingo-add-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("bingo-custom-input");
      const text = input.value.trim();
      if (!text) return;

      state.bingo.customPool.push(text);
      const card = getActiveBingoCard();

      // Buscar una casilla no libre y no marcada para insertar la nueva predicción
      const candidateIndices = card.cells
        .map((c, idx) => (!c.isFree && !c.marked ? idx : -1))
        .filter((idx) => idx !== -1);

      const targetIndex =
        candidateIndices.length > 0
          ? candidateIndices[Math.floor(Math.random() * candidateIndices.length)]
          : 0;

      card.cells[targetIndex].text = text;
      card.cells[targetIndex].isFree = false;
      input.value = "";
      renderBingoBoard();

      const coord = getCellCoordinate(targetIndex, card.size);
      showToast(`Predicción agregada en la casilla ${coord}.`);
    });

    // Modal de edición de casilla individual
    document.getElementById("bingo-edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (editingBingoCellIndex === null) return;
      const newText = document.getElementById("bingo-edit-input").value.trim();
      if (!newText) return;

      const card = getActiveBingoCard();
      if (card.cells[editingBingoCellIndex]) {
        card.cells[editingBingoCellIndex].text = newText;
        if (!state.bingo.customPool.includes(newText)) {
          state.bingo.customPool.push(newText);
        }
      }
      closeBingoEditModal();
      renderBingoBoard();
      showToast("Casilla actualizada.");
    });

    document.getElementById("btn-close-bingo-edit").addEventListener("click", closeBingoEditModal);
    document.getElementById("btn-cancel-bingo-edit").addEventListener("click", closeBingoEditModal);
  }

  // =========================================================================
  // 6. PÁGINA 4: WATCHLIST DE YOUTUBE & CHECKLIST DE LA PREVIA
  // =========================================================================
  function renderWatchlist() {
    const videos = window.GTA_PREVIA_DATA.watchlistVideos;
    const grid = document.getElementById("watchlist-grid");
    if (!grid) return;

    const watchedCount = videos.filter((v) => Boolean(state.watchedVideos[v.id])).length;
    document.getElementById("watchlist-count-text").textContent = `${watchedCount} de ${videos.length}`;

    const cardSurfaces = ["video-card--navy", "video-card--indigo", "video-card--plum", "video-card--violet"];

    grid.innerHTML = videos
      .map((vid, index) => {
        const isWatched = Boolean(state.watchedVideos[vid.id]);
        const thumbUrl = `https://i.ytimg.com/vi/${vid.youtubeId}/hqdefault.jpg`;
        const surfaceClass = cardSurfaces[index % cardSurfaces.length];

        return `
          <article class="video-card ${surfaceClass} ${isWatched ? "is-watched" : ""}">
            <div class="video-thumb-wrap" data-play-video="${vid.id}" title="Reproducir ${escapeHtml(vid.title)}">
              <img
                src="${thumbUrl}"
                alt="Miniatura de ${escapeHtml(vid.title)}"
                class="video-thumb-img"
                loading="lazy"
              />
              <div class="video-thumb-overlay">
                <span class="video-circle-play" aria-hidden="true">▶</span>
                <div class="video-poster-bottom">
                  <span class="rockstar-eyebrow">VER AHORA • ${escapeHtml(vid.channel)}</span>
                  <span class="video-poster-tag">${escapeHtml(vid.tag)}</span>
                </div>
              </div>
            </div>

            <div class="video-body">
              <div>
                <div class="video-meta-top">
                  <span class="video-channel">${escapeHtml(vid.channel)}</span>
                  <span class="badge ${isWatched ? "badge--accent" : ""}">${isWatched ? "✓ VISTO" : "PENDIENTE"}</span>
                </div>
                <h3 class="video-title">${escapeHtml(vid.title)}</h3>
                <p class="video-desc">${escapeHtml(vid.description)}</p>
              </div>

              <div class="video-actions-bar">
                <div class="video-btns-left">
                  <button type="button" class="btn btn--primary btn--sm" data-play-video="${vid.id}">
                    ▶ Reproducir Aquí
                  </button>
                  <a
                    href="${vid.url}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn--secondary btn--sm"
                  >
                    Abrir en YouTube ↗
                  </a>
                </div>

                <label class="watched-toggle-label">
                  <input
                    type="checkbox"
                    data-watch-toggle="${vid.id}"
                    ${isWatched ? "checked" : ""}
                  />
                  <span>Visto</span>
                </label>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-play-video]").forEach((el) => {
      el.addEventListener("click", () => {
        const vidId = el.getAttribute("data-play-video");
        openVideoInTheater(vidId);
      });
    });

    grid.querySelectorAll("[data-watch-toggle]").forEach((chk) => {
      chk.addEventListener("change", () => {
        const vidId = chk.getAttribute("data-watch-toggle");
        state.watchedVideos[vidId] = chk.checked;
        saveState();
        renderWatchlist();
      });
    });
  }

  function openVideoInTheater(videoId) {
    const vid = window.GTA_PREVIA_DATA.watchlistVideos.find((v) => v.id === videoId);
    if (!vid) return;

    activeTheaterVideoId = vid.id;
    const panel = document.getElementById("video-theater-panel");
    const iframe = document.getElementById("theater-iframe");

    document.getElementById("theater-video-tag").textContent = `${vid.channel} • ${vid.tag}`;
    document.getElementById("theater-video-title").textContent = vid.title;
    document.getElementById("btn-theater-open-yt").href = vid.url;

    iframe.src = `https://www.youtube.com/embed/${vid.youtubeId}?autoplay=1&rel=0`;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeVideoTheater() {
    activeTheaterVideoId = null;
    const panel = document.getElementById("video-theater-panel");
    const iframe = document.getElementById("theater-iframe");
    iframe.src = "about:blank";
    panel.hidden = true;
  }

  function renderChecklistCategory(categoryKey, listId, countId, barId) {
    const items = state.checklist[categoryKey] || [];
    const listEl = document.getElementById(listId);
    const countEl = document.getElementById(countId);
    const barEl = document.getElementById(barId);

    const doneCount = items.filter((i) => i.done).length;
    const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

    countEl.textContent = `${doneCount}/${items.length}`;
    barEl.style.width = `${pct}%`;

    listEl.innerHTML = items
      .map(
        (item) => `
        <li class="checklist-item ${item.done ? "is-done" : ""}">
          <label class="checklist-item-label">
            <input
              type="checkbox"
              data-chk-toggle="${item.id}"
              data-chk-cat="${categoryKey}"
              ${item.done ? "checked" : ""}
            />
            <span class="checklist-item-text">${escapeHtml(item.text)}</span>
          </label>
          ${
            item.isCustom
              ? `<button type="button" class="checklist-delete-btn" data-chk-del="${item.id}" data-chk-cat="${categoryKey}" title="Eliminar ítem">✕</button>`
              : ""
          }
        </li>
      `
      )
      .join("");

    listEl.querySelectorAll("[data-chk-toggle]").forEach((chk) => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-chk-toggle");
        const cat = chk.getAttribute("data-chk-cat");
        const target = (state.checklist[cat] || []).find((i) => i.id === id);
        if (target) {
          target.done = chk.checked;
          saveState();
          renderChecklist();
        }
      });
    });

    listEl.querySelectorAll("[data-chk-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-chk-del");
        const cat = btn.getAttribute("data-chk-cat");
        state.checklist[cat] = (state.checklist[cat] || []).filter((i) => i.id !== id);
        saveState();
        renderChecklist();
      });
    });
  }

  function renderChecklist() {
    renderChecklistCategory("console", "chk-list-console", "chk-count-console", "chk-bar-console");
    renderChecklistCategory("snacks", "chk-list-snacks", "chk-count-snacks", "chk-bar-snacks");

    const allItems = [...(state.checklist.console || []), ...(state.checklist.snacks || [])];
    const doneTotal = allItems.filter((i) => i.done).length;
    const totalPct = allItems.length > 0 ? Math.round((doneTotal / allItems.length) * 100) : 0;

    document.getElementById("checklist-total-percent").textContent = `${totalPct}%`;
    document.getElementById("checklist-total-bar").style.width = `${totalPct}%`;

    const captionEl = document.getElementById("checklist-status-caption");
    if (totalPct === 100) {
      captionEl.textContent = "¡100% LISTO! Consolas, controles, snacks y previa al máximo para las 00:00.";
    } else if (totalPct >= 50) {
      captionEl.textContent = `Más de la mitad lista (${doneTotal}/${allItems.length}). Afinando últimos detalles para medianoche.`;
    } else {
      captionEl.textContent = `${doneTotal} de ${allItems.length} tareas completadas. Revisa la Play y los snacks antes de las 00:00.`;
    }
  }

  function initWatchlistAndChecklist() {
    renderWatchlist();
    renderChecklist();

    document.getElementById("btn-theater-close").addEventListener("click", closeVideoTheater);
    document.getElementById("btn-theater-mark-watched").addEventListener("click", () => {
      if (!activeTheaterVideoId) return;
      state.watchedVideos[activeTheaterVideoId] = true;
      saveState();
      renderWatchlist();
      showToast("✓ Video marcado como visto.");
    });

    document.querySelectorAll(".checklist-add-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const cat = form.getAttribute("data-chk-category");
        const input = form.querySelector("input");
        const text = input.value.trim();
        if (!text || !state.checklist[cat]) return;

        state.checklist[cat].push({
          id: `chk-custom-${Date.now()}`,
          text: text,
          done: false,
          isCustom: true
        });
        input.value = "";
        saveState();
        renderChecklist();
        showToast("Ítem añadido al checklist de la previa.");
      });
    });

    document.getElementById("btn-reset-checklist").addEventListener("click", () => {
      state.checklist = JSON.parse(JSON.stringify(window.GTA_PREVIA_DATA.defaultChecklist));
      saveState();
      renderChecklist();
      showToast("Checklist restablecido a sus valores originales.");
    });
  }

  // =========================================================================
  // 7. SINCRONIZACIÓN DE BADGES Y RESUMEN EN PORTADA
  // =========================================================================
  function updateGlobalBadgesAndSummary() {
    // 1. Trivia
    const sortedLB = getSortedLeaderboard();
    const navBadgeTrivia = document.getElementById("nav-badge-trivia");
    const hypeLeader = document.getElementById("hype-stat-leader");
    if (navBadgeTrivia) {
      navBadgeTrivia.textContent = `${sortedLB.length} jug.`;
    }
    if (hypeLeader) {
      if (sortedLB.length > 0) {
        const topWanted = getWantedLevelInfo(sortedLB[0].score);
        const starsStr = topWanted.stars > 0 ? topWanted.filled : "0 ★";
        hypeLeader.textContent = `1.º ${sortedLB[0].name} (${formatPoints(sortedLB[0].score)} pts • ${starsStr})`;
      } else {
        hypeLeader.textContent = "Sin registros aún";
      }
    }

    // 2. Bingo
    const card = getActiveBingoCard();
    const markedCount = card.cells.filter((c) => c.marked).length;
    const totalCells = card.cells.length;
    const { winningLines } = detectBingoLines(card);
    const navBadgeBingo = document.getElementById("nav-badge-bingo");
    const hypeBingo = document.getElementById("hype-stat-bingo");

    if (navBadgeBingo) {
      navBadgeBingo.textContent =
        winningLines.length > 0 ? `¡BINGO! (${winningLines.length})` : `${markedCount}/${totalCells}`;
    }
    if (hypeBingo) {
      hypeBingo.textContent =
        winningLines.length > 0
          ? `¡BINGO! (${winningLines.length} ${winningLines.length === 1 ? "línea" : "líneas"})`
          : `${markedCount} / ${totalCells} casillas`;
    }

    // 3. Videos + Checklist
    const videos = window.GTA_PREVIA_DATA.watchlistVideos;
    const watchedCount = videos.filter((v) => Boolean(state.watchedVideos[v.id])).length;
    const allChk = [...(state.checklist.console || []), ...(state.checklist.snacks || [])];
    const doneChk = allChk.filter((i) => i.done).length;
    const chkPct = allChk.length > 0 ? Math.round((doneChk / allChk.length) * 100) : 0;

    const navBadgeChecklist = document.getElementById("nav-badge-checklist");
    const hypeVideos = document.getElementById("hype-stat-videos");
    const hypeChecklist = document.getElementById("hype-stat-checklist");

    if (navBadgeChecklist) {
      navBadgeChecklist.textContent = `${chkPct}%`;
    }
    if (hypeVideos) {
      hypeVideos.textContent = `${watchedCount} / ${videos.length} vistos`;
    }
    if (hypeChecklist) {
      hypeChecklist.textContent = `${chkPct}% (${doneChk}/${allChk.length})`;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // =========================================================================
  // ARRANQUE DE LA APLICACIÓN
  // =========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initCountdown();
    initTrivia();
    initBingo();
    initWatchlistAndChecklist();
    updateGlobalBadgesAndSummary();
  });
})();
