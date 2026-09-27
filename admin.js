let adminPassword = "";

const $ = (id) => document.getElementById(id);

async function adminApi(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword,
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Error del servidor.");
  }

  return data;
}

async function login() {
  adminPassword = $("passwordInput").value;

  try {
    await loadSessions();
    $("loginCard").classList.add("hidden");
    $("sessionsCard").classList.remove("hidden");
    $("loginError").textContent = "";
  } catch (error) {
    adminPassword = "";
    $("loginError").textContent = error.message;
  }
}

async function loadSessions() {
  const data = await adminApi("/api/admin/sessions");
  renderSessions(data.sessions);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function renderSessions(sessions) {
  const container = $("sessions");

  if (!sessions.length) {
    container.innerHTML = `<div class="empty">No hay usuarios activos.</div>`;
    return;
  }

  container.innerHTML = sessions.map((session) => `
    <article class="session">
      <div class="session-title">Usuario ${escapeHtml(session.sessionId)}</div>
      <div class="meta">
        Estado: ${escapeHtml(session.status)} ·
        Micro-pasos completados: ${session.stepCount}/${session.maxSteps}
      </div>

      <div class="task">
        <strong>Tarea:</strong><br>
        ${escapeHtml(session.task)}
      </div>

      <div class="meta">
        ${session.currentStep
          ? `<strong>Último micro-paso:</strong> ${escapeHtml(session.currentStep.text)}`
          : "<strong>Está esperando un micro-paso.</strong>"}
      </div>

      <label for="step-${session.sessionId}">Nuevo micro-paso</label>
      <textarea id="step-${session.sessionId}" placeholder="Escribe una sola acción pequeña..."></textarea>

      <button
        class="primary"
        data-session="${escapeHtml(session.sessionId)}"
        onclick="sendStep(this.dataset.session)"
      >
        Enviar micro-paso
      </button>
    </article>
  `).join("");
}

async function sendStep(sessionId) {
  const textarea = document.getElementById(`step-${sessionId}`);
  const text = textarea.value.trim();

  if (!text) {
    alert("Escribe el micro-paso.");
    return;
  }

  try {
    await adminApi("/api/admin/step", {
      method: "POST",
      body: JSON.stringify({ sessionId, text })
    });

    textarea.value = "";
    await loadSessions();
  } catch (error) {
    alert(error.message);
  }
}

$("loginButton").addEventListener("click", login);
$("passwordInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

$("refreshButton").addEventListener("click", async () => {
  if (!adminPassword) return;
  try {
    await loadSessions();
  } catch (error) {
    alert(error.message);
  }
});

window.sendStep = sendStep;
