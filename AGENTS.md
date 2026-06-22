# Agent Guide — Local Quiz

> For human onboarding and usage instructions, see `README.md`.
> This file is for coding agents working on the codebase.

## Project overview

Local Quiz is a real-time, Kahoot-style quiz application with a cyberpunk/terminal aesthetic. A host creates a session and gets a 6-digit PIN; players join with the PIN and answer questions in real time.

## Tech stack

- **Runtime:** Node.js 22 LTS (see `.nvmrc`; minimum Node 20)
- **Backend:** Express 5, Socket.IO 4, Multer 2
- **Database:** SQLite via `better-sqlite3`
- **Frontend:** Vanilla JavaScript ES modules, Socket.IO client served by the server
- **Styling:** Plain CSS (terminal / cyberpunk theme)
- **Quality:** Husky + lint-staged + Prettier

## Project structure

```
local-quiz/
├── config/           # App configuration
├── db/               # SQLite schema, connection, seed script
├── middleware/       # Express middleware (auth, error handling)
├── public/           # Static frontend assets
│   ├── css/          # Plain CSS files
│   ├── js/           # ES module JS files
│   ├── host.html
│   ├── index.html
│   └── play.html
├── routes/           # Express route handlers (auth, quizzes, sessions, upload)
├── services/         # Database service layer
├── socket/           # Socket.IO handlers and game logic
│   ├── game/         # GameSession, QuestionEngine, Scoring
│   └── handlers/     # host.js, player.js
├── tests/            # E2E tests
├── uploads/          # Uploaded images
├── server.js         # Application entry point
└── sample-quiz.json  # Example quiz import
```

## Development workflow

```bash
npm install
npm run seed      # create static host + sample quiz
npm run dev       # dev server with file watch
npm test          # full E2E game simulation
npm run format    # format with Prettier
npm run format:check
```

## Code conventions

- Use **ES modules** everywhere (`"type": "module"` in `package.json`).
- Pin dependencies to **exact versions** in `package.json` (no `^` or `~`).
- Run `npm run format` before committing; the pre-commit hook will also run Prettier.
- Follow the existing file structure and naming patterns.
- Keep the frontend vanilla JS; no frameworks.

## Important patterns

### Socket.IO client loading

The Socket.IO client is served by the server at `/socket.io/socket.io.js` as a global script. It is **not** an ES module.

HTML pages load it before module scripts:

```html
<script src="/socket.io/socket.io.js"></script>
<script type="module" src="/js/host.js"></script>
```

Frontend code uses the global:

```js
const socket = window.io();
```

### Scoring rules

- Full score within the first 5 seconds of the question timer.
- Linear decay after the 5-second window, reaching 0 at time expiry.
- Wrong or incomplete answers earn 0 points.
- `multiple_choice` (multi-select) is **all-or-nothing**.

### Game flow

1. Host logs in and creates a session from a quiz.
2. Server generates a 6-digit PIN (validates quiz has questions).
3. Players join with PIN + nickname.
4. Host starts the game from the lobby.
5. Server shows a configurable splash countdown before each question.
6. Server emits the question; players answer within the time limit.
7. Server reveals correct answers and emits leaderboards as a separate screen.
8. Host advances to the next question (splash countdown repeats).
9. After the final question, the server emits final results and saves them.

### Socket disconnect handling

- **Connection banner**: A fixed banner at the top of the page shows connection status (`disconnected` / `reconnecting`). Defined in `socket.js`.
- **Host disconnect**: If the host's socket disconnects mid-game, the session is destroyed and all players receive `server:host-disconnected` and are redirected.
- **Player disconnect during game**: Players are NOT removed from the session during active gameplay. They are marked `connected: false` via `markDisconnected(socketId)`. This preserves their score and answered state for reconnection.
- **Player disconnect in lobby**: Players ARE fully removed on disconnect (removed from in-memory array and DB).

### Player reconnection

When a player refreshes the page mid-game, they auto-rejoin and restore their correct screen:

1. On successful join (`player:joined`), `pin` and `nickname` are stored in `sessionStorage`.
2. On page load, if saved credentials exist, the client emits `player:rejoin` (instead of `player:join`).
3. Server finds the existing player by nickname, updates their `socket_id` (preserving score + answers), and calls `engine.getReconnectState(playerId)`.
4. Server sends `player:reconnect-state` with the current screen + data.
5. Client restores the correct screen based on the state:
   - `splash` — countdown between questions
   - `question` — question with remaining timer; if `hasAnswered=true`, options are disabled
   - `reveal` — correct answers highlighted
   - `leaderboard` — round results
   - `gameOver` — final podium
   - `waiting` — lobby (game not started)

The `allAnswered` check in `QuestionEngine` uses `session.getConnectedCount()` (only connected players) instead of `session.players.length` (all players including disconnected) to avoid the game stalling or advancing incorrectly when players are mid-reconnect.

### Reconnection race conditions

| Scenario                                            | Resolution                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| New `player:rejoin` arrives before old `disconnect` | `addPlayer` finds existing player, updates socket_id. Old disconnect fires later with stale socket_id — no player matched, no-op |
| Old `disconnect` arrives before new `rejoin`        | Player marked disconnected. `addPlayer` finds existing (still in array), resets connected=true                                   |
| Socket reconnects but session expired               | `player:join-error` → clears sessionStorage, shows join form                                                                     |

### Question layout phases

The question screen uses a two-phase layout toggled via the `reveal-layout` class:

| Phase                                               | `reveal-layout` class  | Behavior                                                                                           |
| --------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Read delay** (question text only, options hidden) | Removed                | `.qs-center` / `.hqv-content` uses `justify-content: center` — question text centered              |
| **Answering** (options visible after read delay)    | Added                  | `justify-content: flex-start` + `margin-top: auto` on options — question at top, options at bottom |
| **Answer reveal**                                   | Added (already active) | Same as answering — question at top, options at bottom                                             |

**Player DOM structure:**

```
.qs-center              → flex: 1; justify-content: center (default)
  .question-main        → flex-shrink: 0
  #options-container    → margin-top: auto (only when .qs-center.reveal-layout)
```

**Host DOM structure:**

```
.hqv-content              → flex: 1; justify-content: center (default)
  .hqv-question-card      → flex-shrink: 0
  #host-options           → margin-top: auto (only when .hqv-content.reveal-layout)
```

The `reveal-layout` class is toggled in `renderQuestion`/`renderHostQuestion` (removed for read mode) and added back when read delay expires or on `server:answer-reveal`.

### Loading states

All async operations disable their trigger button and show a `LOADING...` / `IMPORTING...` / `SAVING...` text. Use the `setLoading(btnId, loading, text, normalText)` helper.

### Adding a new feature

- **New API endpoint:** add a file in `routes/` and register it in `server.js`.
- **New Socket.IO event:** add a handler in `socket/handlers/host.js` or `player.js`.
- **New question type:** update `db/schema.sql` validation in `services/quizService.js`, scoring in `socket/game/Scoring.js`, question rendering in `public/js/player.js`, and answer handling.
- **New frontend screen:** add the screen to the relevant HTML file, toggle visibility via the JS module, and style it in `public/css/`.
- **Results history:** API routes in `routes/sessions.js`, DB queries in `services/gameService.js`, frontend modal + rendering in `public/js/host.js`, styles in `public/css/components.css`.

## Environment

Copy `.env.example` to `.env` and adjust values as needed. The default host credentials are:

- Username: `host`
- Password: `host1234`

## Testing

Run `npm test` to execute the E2E simulation. It spawns the server, logs in a host, creates a session, joins three simulated players, plays through the sample quiz, and verifies the final results are saved.
