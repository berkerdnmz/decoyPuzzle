# ♟ DecoyPuzzle — Chess Puzzle Trainer

A chess puzzle trainer with a twist: before making a move, you must first judge whether the position even has a winning move.

## What makes it different

Classic puzzle trainers always guarantee a solution exists. DecoyPuzzle doesn't.
Each position is either:
- ✅ **Winning** — find the move
- ❌ **Not winning** — recognize it and say so

Wrong judgment = ELO loss, even if you'd find the right move afterwards.

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React + Vite |
| Hosting | GitHub Pages |
| Auth | Supabase (Google OAuth) |
| Database | Supabase (PostgreSQL) |
| Puzzles | Lichess open data (CC0) |
| Chess logic | chess.js + react-chessboard |

## Setup

### 1. Clone & install
```bash
git clone https://github.com/berkerdnmz/chess-puzzle-trainer
cd chess-puzzle-trainer
npm install
```

### 2. Create Supabase project
1. Go to supabase.com and create a free project
2. Go to **SQL Editor** and run `supabase_schema.sql`
3. Go to **Authentication → Providers** → enable **Google**

### 3. Configure environment
```bash
cp .env.example .env
# Fill in your Supabase URL and anon key
```

### 4. Run locally
```bash
npm run dev
```

### 5. Deploy to GitHub Pages
1. Push to GitHub
2. Add secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Settings → Pages → Source: `gh-pages` branch

## License
MIT — source code open. User data stays in your Supabase project.