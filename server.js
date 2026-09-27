require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambia-esta-clave";

const MAX_STEPS = 10;

/*
  MVP: los datos viven en memoria.
  Si reinicias el servidor, se pierden.
  Esto es intencional para la primera prueba.
*/
const sessions = new Map();
const typingAlerts = new Set();

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function requireSession(req, res) {
  const sessionId = cleanText(req.params.sessionId, 100);

  if (!sessionId) {
    res.status(400).json({ error: "Falta sessionId." });
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: "Sesión no encontrada." });
    return null;
  }

  return session;
}

function publicSession(session) {
  return {
    sessionId: session.sessionId,
    task: session.task,
    currentStep: session.currentStep,
    status: session.status,
    stepCount: session.stepCount,
    maxSteps: MAX_STEPS,
    finished: session.finished,
    feedback: session.feedback
  };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram no está configurado; se omite el envío.");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram respondió ${response.status}: ${body}`);
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    activeSessions: sessions.size
  });
});

/* Una sola alerta de escritura por sesión. */
app.post("/api/typing", async (req, res) => {
  const sessionId = cleanText(req.body.sessionId, 100);

  if (!sessionId) {
    return res.status(400).json({ error: "Falta sessionId." });
  }

  if (typingAlerts.has(sessionId)) {
    return res.json({ ok: true, alreadySent: true });
  }

  typingAlerts.add(sessionId);

  try {
    await sendTelegram(`✍️ ALGUIEN ESTÁ ESCRIBIENDO\n\nUsuario: ${sessionId}`);
    res.json({ ok: true, sent: true });
  } catch (error) {
    typingAlerts.delete(sessionId);
    console.error(error);
    res.status(502).json({ error: "No se pudo enviar la alerta de Telegram." });
  }
});

/* Nueva tarea. */
app.post("/api/task", async (req, res) => {
  const sessionId = cleanText(req.body.sessionId, 100);
  const task = cleanText(req.body.task, 1000);

  if (!sessionId || !task) {
    return res.status(400).json({ error: "Faltan sessionId o task." });
  }

  const old = sessions.get(sessionId);
  if (old && !old.finished) {
    return res.status(409).json({
      error: "Esta sesión ya tiene una tarea activa.",
      session: publicSession(old)
    });
  }

  const session = {
    sessionId,
    task,
    currentStep: null,
    stepCount: 0,
    status: "waiting_step",
    feedback: null,
    finished: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  sessions.set(sessionId, session);

  try {
    await sendTelegram([
      "🔔 NUEVA TAREA",
      "",
      `Usuario: ${sessionId}`,
      "",
      "Tarea:",
      task,
      "",
      "El usuario está esperando su primer micro-paso."
    ].join("\n"));

    res.status(201).json({ ok: true, session: publicSession(session) });
  } catch (error) {
    sessions.delete(sessionId);
    console.error(error);
    res.status(502).json({ error: "No se pudo notificar la nueva tarea por Telegram." });
  }
});

app.get("/api/session/:sessionId", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.json({ session: publicSession(session) });
});

app.post("/api/session/:sessionId/start", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  if (!session.currentStep) {
    return res.status(409).json({ error: "Todavía no hay un micro-paso." });
  }

  session.status = "in_progress";
  session.updatedAt = new Date().toISOString();

  res.json({ ok: true, session: publicSession(session) });
});

app.post("/api/session/:sessionId/complete", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  if (!session.currentStep) {
    return res.status(409).json({ error: "No hay un micro-paso activo." });
  }

  session.status = "completed";
  session.updatedAt = new Date().toISOString();

  try {
    await sendTelegram([
      "✅ PASO COMPLETADO",
      "",
      `Usuario: ${session.sessionId}`,
      "",
      "Tarea:",
      session.task,
      "",
      "Último paso:",
      session.currentStep.text,
      "",
      "Estado: Completado.",
      "El usuario puede solicitar el siguiente paso."
    ].join("\n"));

    res.json({ ok: true, session: publicSession(session) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "No se pudo notificar la finalización." });
  }
});

app.post("/api/session/:sessionId/feedback", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const feedback = req.body.feedback;

  if (!["yes", "no"].includes(feedback)) {
    return res.status(400).json({ error: "Feedback inválido." });
  }

  session.feedback = feedback;
  session.updatedAt = new Date().toISOString();

  try {
    await sendTelegram([
      "💬 FEEDBACK",
      "",
      `Usuario: ${session.sessionId}`,
      `Tarea: ${session.task}`,
      `Micro-paso: ${session.currentStep?.text || "-"}`,
      `¿Le ayudó a arrancar?: ${feedback === "yes" ? "Sí" : "No"}`
    ].join("\n"));
  } catch (error) {
    console.error("No se pudo enviar feedback a Telegram:", error.message);
  }

  res.json({ ok: true });
});

app.post("/api/session/:sessionId/next", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  if (session.status !== "completed") {
    return res.status(409).json({ error: "Primero debes completar el micro-paso." });
  }

  if (session.stepCount >= MAX_STEPS) {
    session.finished = true;
    session.status = "finished";
    return res.status(409).json({ error: "MAX_STEPS_REACHED" });
  }

  const lastStep = session.currentStep?.text || "(no registrado)";

  session.status = "waiting_step";
  session.currentStep = null;
  session.feedback = null;
  session.updatedAt = new Date().toISOString();

  try {
    await sendTelegram([
      "🔔 SIGUIENTE PASO",
      "",
      `Usuario: ${session.sessionId}`,
      "",
      "Tarea:",
      session.task,
      "",
      "Último paso:",
      lastStep,
      "",
      "Estado: Completado.",
      "El usuario está esperando el siguiente micro-paso."
    ].join("\n"));

    res.json({ ok: true, waiting: true });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "No se pudo enviar la solicitud por Telegram." });
  }
});

/* Panel privado para ti. */
function adminAuth(req, res, next) {
  if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "No autorizado." });
  }
  next();
}

app.get("/api/admin/sessions", adminAuth, (req, res) => {
  const result = [...sessions.values()]
    .filter((session) => !session.finished)
    .map(publicSession);

  res.json({ sessions: result });
});

app.post("/api/admin/step", adminAuth, async (req, res) => {
  const sessionId = cleanText(req.body.sessionId, 100);
  const text = cleanText(req.body.text, 500);

  if (!sessionId || !text) {
    return res.status(400).json({ error: "Faltan sessionId o text." });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Sesión no encontrada." });
  }

  if (session.finished) {
    return res.status(409).json({ error: "La sesión ya terminó." });
  }

  if (session.stepCount >= MAX_STEPS) {
    session.finished = true;
    session.status = "finished";
    return res.status(409).json({ error: "MAX_STEPS_REACHED" });
  }

  session.stepCount += 1;
  session.currentStep = {
    number: session.stepCount,
    text
  };
  session.status = "ready";
  session.feedback = null;
  session.updatedAt = new Date().toISOString();

  res.json({ ok: true, session: publicSession(session) });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.use("/admin", express.static(path.join(__dirname, "admin")));

app.listen(PORT, () => {
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`Panel:    http://localhost:${PORT}/admin`);
  console.log(`Telegram: ${TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "configurado" : "NO configurado"}`);
});