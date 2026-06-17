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
- Multiple-select is **all-or-nothing**.

### Game flow

1. Host logs in and creates a session from a quiz.
2. Server generates a 6-digit PIN.
3. Players join with PIN + nickname.
4. Host starts the game from the lobby.
5. Server shows a configurable splash countdown before each question.
6. Server emits the question; players answer within the time limit.
7. Server reveals correct answers and emits leaderboards as a separate screen.
8. Host advances to the next question (splash countdown repeats).
9. After the final question, the server emits final results and saves them.

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
