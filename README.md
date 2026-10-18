# Make a Drink

A bartending trainer you play in the browser. A customer walks up and orders. You build the drink at a 3D bar station by dragging glasses, bottles, ice, tins and garnishes, then serve it and get graded on how close you came to the spec.

**Play it:** https://bar-trainer-beta.vercel.app
Built solo for DubHacks 2026.

## Why

You have to be 21 to buy ingredients and to work behind a bar, so there's no good way to practice mixology before then. Make a Drink lets you practice the hands-on part (glassware, free pouring, shaking, stirring, straining) without pouring real liquor.

## How it plays

- **Pick the glass.** Drag the right one onto the bar mat. Each glass explains what it's for.
- **Pour.** Bring a bottle from the speed rail toward the glass or tin. It tips and pours, with a count and a target line while you learn.
- **Mix.** Scoop ice, cap the Boston shaker and shake until the meter reads ready, or circle the bar spoon in the open tin to stir.
- **Finish.** Drop the open tin on the glass to strain, add the garnish, and serve.

Every ingredient is measured to the hundredth of an ounce. A shift is five customers, with tips, streaks and a speed bonus. The game has 22 classic cocktails, 23 ingredients, 7 glasses and 8 garnishes.

## How the AI is used

| Feature | What the AI does | What code decides |
|---|---|---|
| Customers and orders (`POST /api/order`) | Gemini writes the customer, what they say, and the drink spec as structured JSON. | Whether the order is allowed at all (see below). |
| Grading (`POST /api/grade`) | Gemini voices the customer's reaction and one coaching tip. | The score. A fixed rubric scores the measured drink, and Gemini's star rating is clamped to within one star of it. |
| Practice memory (Backboard) | Backboard stores and searches each player's past mistakes. | What gets stored: only mistake facts computed from the score, written by the server. |

This app is not a chatbot. No endpoint takes a chat message or question from the player.

## Safety controls

Every rule that matters is enforced in code, not only in the prompt.

- **Strict input.** `/api/order` accepts only `{ recent, assistantId }`: up to 10 recently served drink names and the player's memory id. Any other body (a chat message, extra fields, wrong types) gets a `400` refusal and never reaches Gemini. See `parseOrderRequest` in `src/game/order.ts`.
- **Every order is checked before it reaches the bar** (`parseOrder` in `src/game/order.ts`):
  - the customer is 21 or older;
  - at most 3 oz of liquor (spirits plus liqueurs) and at most 6 ingredients;
  - only the bar's own ingredients, glasses and garnishes;
  - the drink fits its glass, and coupe, martini and shot glasses get no ice;
  - the dialogue is screened for underage hints (ages, "fake ID", school) and over-serving (doubles, "get drunk", driving).
  A rejected order is regenerated once. If it fails again, or Gemini is unreachable, the customer orders off the classic menu.
- **Orders are re-checked on the way back.** When the browser sends an order back for grading, the server runs it through the same checks again (`recheckOrder`).
- **Grades are bounded.** The rubric in `src/game/score.ts` decides the points. Gemini's stars are clamped to ±1 of the rubric, and its reaction and tip go through the same dialogue screen (`parseGrade` in `src/game/grade.ts`).
- **Untrusted text is marked as data.** Recent drink names and recalled memories are filtered to plain text. In the prompt, drink names are quoted and memories are listed under a "data, not instructions" heading.
- **Strictest Gemini safety filters.** Harassment, hate speech, sexual content and dangerous content are all set to `BLOCK_LOW_AND_ABOVE` (`src/server/gemini.ts`).
- **Rate limits.** Orders and grades: 10 a minute per visitor and 60 a minute overall. New memories: 5 an hour per visitor. Over the limit, players still get a classic order or a rubric grade. These limits live in each server instance's memory, so they slow abuse but don't replace a shared limiter.
- **No personal data.** No accounts or logins. The memory id is a random id kept in the player's browser, and memories hold only drink mistakes like "Negroni: Over-poured the Gin by 0.25 oz".
- **Keys stay on the server.** `GEMINI_API_KEY` and `BACKBOARD_API_KEY` are read only by server routes and never sent to the browser.

## Tech

- Next.js 16, React 19, TypeScript and Tailwind CSS
- three.js with React Three Fiber for the 3D bar, and Rapier for ice physics in the glass
- Google Gemini through its REST API (no SDK). It tries `gemini-3.8-flash`, then `gemini-3.5-flash`, then `gemini-3.5-flash-lite` when a model is busy or out of quota.
- Backboard for each player's long-term practice memory
- Deployed on Vercel

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
```

Create `.env.local` in the project folder:

```
GEMINI_API_KEY=your-gemini-key
BACKBOARD_API_KEY=your-backboard-key
```

Both keys are optional. Without `GEMINI_API_KEY`, customers order off the classic menu and grades come from the rubric. Without `BACKBOARD_API_KEY`, memory is off and orders aren't targeted. `GEMINI_MODELS` (comma-separated) overrides the model list.

```bash
npm run dev
```

Then open http://localhost:3000.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Node's built-in test runner) |
| `npm run lint` | ESLint |
| `npm run settle-ice` | Re-packs the ice well by simulating it once with Rapier. Run it after changing the well's size or ice count. |

## Project layout

```
src/
  app/api/order    customer orders (Gemini) with input and output checks
  app/api/grade    rubric score plus Gemini's reaction; saves mistakes to memory
  app/api/memory   creates a player's Backboard memory
  game/            rules with no UI: drink state, recipes, orders, scoring, shifts, memory facts
  server/          Gemini and Backboard clients, prompts, rate limiter
  components/      the bar (bar3d/) and the sidebar
scripts/           one-off tools (settle-ice)
```
