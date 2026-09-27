const state = {
  sessionId: localStorage.getItem("micro_productividad_session") || crypto.randomUUID(),
  task: "",
  step: null,
  feedback: null,
  typingAlertSent: false
};

let timerInterval = null;
let remainingSeconds = 120;

localStorage.setItem("micro_productividad_session", state.sessionId);

const $ = (id) => document.getElementById(id);

const screens = [
  $("startScreen"),
  $("waitingScreen"),
  $("stepScreen"),
  $("workingScreen"),
  $("completedScreen"),
  $("finishedScreen")
];

function showScreen(screen) {
  screens.forEach((item) => item.classList.add("hidden"));
  screen.classList.remove("hidden");
}

function setError(message = "") {
  $("startError").textContent = message;
  $("startError").classList.toggle("hidden", !message);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la operación.");
  }

  return data;
}

function renderStep() {
  if (!state.step) return;

  $("microStep").textContent = state.step.text;
  $("workingStep").textContent = state.step.text;
  $("fullTask").textContent = state.task;
  $("fullTask").classList.add("hidden");

  $("nextHint").textContent = "";
}

function startTimer() {
  clearInterval(timerInterval);

  remainingSeconds = 120;
  $("timer").textContent = "02:00";

  timerInterval = setInterval(() => {
    remainingSeconds--;

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    $("timer").textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;

      $("timer").textContent = "00:00";
    }
  }, 1000);
}

async function loadSession() {
  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);

    if (!data.session) return;

    state.task = data.session.task || "";
    state.step = data.session.currentStep || null;

    if (data.session.finished) {
      showScreen($("finishedScreen"));
      return;
    }

    if (!state.step) {
      showScreen($("waitingScreen"));
      return;
    }

    renderStep();

    const status = data.session.status;

    if (status === "in_progress") showScreen($("workingScreen"));
    else if (status === "completed") showScreen($("completedScreen"));
    else showScreen($("stepScreen"));
  } catch {
    showScreen($("startScreen"));
  }
}

$("taskInput").addEventListener("input", async () => {
  $("charCount").textContent = $("taskInput").value.length;

  if (state.typingAlertSent || !$("taskInput").value.trim()) return;

  state.typingAlertSent = true;

  try {
    await api("/api/typing", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId })
    });
  } catch {
    /* La alerta nunca interrumpe al usuario. */
  }
});

$("breakdownButton").addEventListener("click", async () => {
  const task = $("taskInput").value.trim();

  if (!task) {
    setError("Escribe una tarea primero.");
    return;
  }

  setError("");
  $("breakdownButton").disabled = true;
  state.task = task;
  showScreen($("waitingScreen"));

  try {
    const data = await api("/api/task", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, task })
    });

    state.step = data.session.currentStep || null;

    if (state.step) {
      renderStep();
      showScreen($("stepScreen"));
    }
  } catch (error) {
    setError(error.message);
    showScreen($("startScreen"));
  } finally {
    $("breakdownButton").disabled = false;
  }
});

$("showTaskButton").addEventListener("click", () => {
  $("fullTask").classList.toggle("hidden");
});

$("startButton").addEventListener("click", async () => {
  try {
    await api(`/api/session/${encodeURIComponent(state.sessionId)}/start`, {
      method: "POST"
    });

    showScreen($("workingScreen"));
    startTimer();

  } catch (error) {
    alert(error.message);
  }
});

$("doneButton").addEventListener("click", async () => {
  try {
    await api(`/api/session/${encodeURIComponent(state.sessionId)}/complete`, {
      method: "POST"
    });
    showScreen($("completedScreen"));
  } catch (error) {
    alert(error.message);
  }
});

$("doneButton").addEventListener("click", async () => {
  try {
    await api(`/api/session/${encodeURIComponent(state.sessionId)}/complete`, {
      method: "POST"
    });

    clearInterval(timerInterval);
    timerInterval = null;

    showScreen($("completedScreen"));
  } catch (error) {
    alert(error.message);
  }
});

document.querySelectorAll(".feedback-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const feedback = button.dataset.feedback;

    try {
      await api(`/api/session/${encodeURIComponent(state.sessionId)}/feedback`, {
        method: "POST",
        body: JSON.stringify({ feedback })
      });

      document.querySelectorAll(".feedback-button").forEach((item) => {
        item.classList.remove("selected");
      });

      button.classList.add("selected");
      state.feedback = feedback;
    } catch (error) {
      alert(error.message);
    }
  });
});

$("nextStepButton").addEventListener("click", async () => {
  try {
    await api(`/api/session/${encodeURIComponent(state.sessionId)}/next`, {
      method: "POST"
    });

    showScreen($("waitingScreen"));
  } catch (error) {
    if (error.message === "MAX_STEPS_REACHED") {
      showScreen($("finishedScreen"));
      return;
    }

    alert(error.message);
  }
});

$("newTaskButton").addEventListener("click", () => {
  state.sessionId = crypto.randomUUID();
  localStorage.setItem("micro_productividad_session", state.sessionId);

  state.task = "";
  state.step = null;
  state.feedback = null;
  state.typingAlertSent = false;

  $("taskInput").value = "";
  $("charCount").textContent = "0";
  setError("");

  document.querySelectorAll(".feedback-button").forEach((button) => {
    button.classList.remove("selected");
  });

  showScreen($("startScreen"));
});

loadSession();

setInterval(async () => {
  // Solo buscamos nuevos pasos mientras estamos esperando.
  const waitingVisible = !$("waitingScreen").classList.contains("hidden");

  if (!waitingVisible) return;

  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);

    if (!data.session) return;

    state.task = data.session.task || "";
    state.step = data.session.currentStep || null;

    if (data.session.finished) {
      showScreen($("finishedScreen"));
      return;
    }

    if (state.step) {
      renderStep();

      const status = data.session.status;

      if (status === "in_progress") {
        showScreen($("workingScreen"));
      } else if (status === "completed") {
        showScreen($("completedScreen"));
      } else {
        showScreen($("stepScreen"));
      }
    }
  } catch {
    // Si una consulta falla, seguimos intentando en la siguiente.
  }
}, 2000);
