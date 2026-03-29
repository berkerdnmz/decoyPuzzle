import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { Chess } from 'chess.js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Env değişkenleri eksik')
  process.exit(1)
}

const supabase = createClient(url, key)

const csv = readFileSync('puzzles_10000.csv', 'utf-8')
const records = parse(csv, { columns: true, skip_empty_lines: true })

console.log(`Toplam ${records.length} puzzle okundu`)

const puzzles = []

for (const row of records) {
  const fen = row.FEN
  const movesRaw = row.Moves
  const rating = parseInt(row.Rating)
  const themes = row.Themes?.split(' ').filter(Boolean) ?? []
  const lichessId = row.PuzzleId

  if (!fen || !movesRaw || isNaN(rating)) continue

  const moves = movesRaw.trim().split(' ')
  if (moves.length < 2) continue

  const setupMove = moves[0]
  const solutionMoves = moves.slice(1)

  // Validate
  try {
    const chess = new Chess(fen)
    // Test setup move
    chess.move({ from: setupMove.slice(0,2), to: setupMove.slice(2,4), promotion: setupMove[4] || undefined })
  } catch (e) {
    console.warn(`Geçersiz: ${lichessId} - ${e.message}`)
    continue
  }

  puzzles.push({
    fen,
    setup_move: setupMove,
    has_winning_move: true,
    solution_moves: solutionMoves,
    rating,
    themes,
    lichess_id: lichessId,
  })
}

console.log(`${puzzles.length} puzzle işlendi`)

for (let i = 0; i < puzzles.length; i += 50) {
  const batch = puzzles.slice(i, i + 50)
  const { error } = await supabase.from('puzzles').insert(batch)
  if (error) console.error(`Hata:`, error.message)
  else console.log(`✓ ${i + batch.length}/${puzzles.length}`)
}

console.log('Tamamlandı!')