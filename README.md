# Un paso a la vez — MVP V1

## Flujo

1. El usuario escribe una tarea.
2. El navegador avisa una sola vez que empezó a escribir.
3. El usuario envía la tarea.
4. El backend te avisa por Telegram.
5. Tú escribes manualmente el micro-paso en `/admin`.
6. El usuario ve solo ese micro-paso; la tarea completa queda oculta.
7. Puede Comenzar, Volver a comenzar y marcar Hecho.
8. Puede responder si le ayudó a arrancar.
9. Al pedir Siguiente paso, recibes por Telegram la tarea, el último paso y el estado.
10. Puedes enviar otro micro-paso.
11. Hay máximo 10 micro-pasos.
12. Después aparece el mensaje final.

## Instalación local

```bash
npm install
```

Copia `.env.example` a `.env` y completa:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- ADMIN_PASSWORD

Luego:

```bash
npm start
```

Abre:

- Usuario: http://localhost:3000
- Panel privado: http://localhost:3000/admin

## Seguridad

El token de Telegram está únicamente en `.env`, que el navegador nunca recibe.
No subas `.env` a GitHub.

Esta primera versión guarda las sesiones en memoria. Si reinicias el servidor, se pierden. Antes de un uso más amplio conviene agregar una base de datos, HTTPS y una autenticación más robusta para el panel.
