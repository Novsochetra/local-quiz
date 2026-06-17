# Local Quiz

> For development patterns and agent instructions, see `AGENTS.md`.

A real-time, cyberpunk-themed quiz application inspired by Kahoot. Host a quiz session from your browser, share the 6-digit PIN, and let players join and compete on their phones.

## Features

- Host login with JWT authentication
- Quiz creation via JSON import
- Real-time game lobby with live player list
- Multiple choice, true/false, and multiple-select questions
- Speed-based scoring: answer within the first 5 seconds for full points
- Live leaderboards and final podium
- Game results saved to SQLite
- Cyberpunk terminal UI with sound effects

## Prerequisites

- Node.js 22 LTS (see `.nvmrc`)
- npm

## Installation

```bash
npm install
npm run seed
```

## Running the app

```bash
npm run dev
```

Then open:

- **Host:** http://localhost:3000/host
- **Players:** http://localhost:3000/play

## Host credentials

Default static host account:

- Username: `host`
- Password: `host1234`

## How to play

1. **Host** logs in, selects or imports a quiz, and clicks **Host**.
2. A 6-digit PIN appears on the lobby screen.
3. **Players** enter the PIN and a nickname to join.
4. When everyone is ready, the host clicks **Start Game**.
5. Players answer each question as quickly as possible.
6. The host clicks **Next Question** after each leaderboard.
7. Final podium appears after the last question.

## Importing a quiz

Copy the contents of `sample-quiz.json`, paste it into the **Import Quiz (JSON)** textarea on the host dashboard, and click **Import**.

Supported question types:

- `multiple_choice`
- `true_false`
- `multiple_select`

## Testing

```bash
npm test
```

Runs a full end-to-end simulation of a game with one host and three players.

## Project structure

See `AGENTS.md` for the full agent/development guide.
