import { useState, useEffect, useCallback, useRef } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { calculateNewElo, eloDiff } from '../lib/elo'

const PHASE = { SETUP: 'setup', JUDGE: 'judge', MOVE: 'move', RESULT: 'result' }

function uciToSan(chess, uci) {
  try {
    const copy = new Chess(chess.fen())
    const move = copy.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined })
    return move?.san ?? uci
  } catch { return uci }
}

export default function PuzzlePage() {
  const { user, profile, refreshProfile } = useAuth()

  const [puzzle, setPuzzle] = useState(null)
  const [game, setGame] = useState(null)
  const [phase, setPhase] = useState(PHASE.SETUP)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [boardOrientation, setBoardOrientation] = useState('white')
  const [highlightSquares, setHighlightSquares] = useState({})
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [playerColor, setPlayerColor] = useState('w')
  const [arrows, setArrows] = useState([])

  const phaseRef = useRef(PHASE.SETUP)
  const puzzleRef = useRef(null)
  const gameRef = useRef(null)
  const moveIndexRef = useRef(0)
  const playerColorRef = useRef('w')

  function updatePhase(p) {
    phaseRef.current = p
    setPhase(p)
  }

  const loadPuzzle = useCallback(async () => {
    updatePhase(PHASE.SETUP)
    setResult(null)
    setHighlightSquares({})
    setArrows([])
    setSelectedSquare(null)
    moveIndexRef.current = 0
    setLoading(true)

    const playerElo = profile?.elo ?? 1000

    let { data } = await supabase
      .from('puzzles').select('*')
      .gte('rating', playerElo - 200)
      .lte('rating', playerElo + 200)
      .limit(50)

    if (!data || data.length === 0) {
      const { data: fallback } = await supabase.from('puzzles').select('*').limit(20)
      data = fallback
    }

    if (!data || data.length === 0) { setLoading(false); return }

    const picked = data[Math.floor(Math.random() * data.length)]
    const chess = new Chess(picked.fen)

    const opponentColor = chess.turn()
    const color = opponentColor === 'w' ? 'b' : 'w'

    puzzleRef.current = picked
    gameRef.current = chess
    playerColorRef.current = color
    setPlayerColor(color)
    setPuzzle(picked)
    setGame(chess)
    setBoardOrientation(color === 'w' ? 'white' : 'black')
    setLoading(false)

    setTimeout(() => animateSetupMove(chess, picked), 800)
  }, [profile?.elo])

  function animateSetupMove(chess, picked) {
    const setupMove = picked.setup_move
    if (!setupMove) {
      updatePhase(PHASE.JUDGE)
      return
    }

    const from = setupMove.slice(0, 2)
    const to = setupMove.slice(2, 4)
    const promotion = setupMove[4] || undefined

    const gameCopy = new Chess(chess.fen())
    try {
      gameCopy.move({ from, to, promotion })
    } catch {
      updatePhase(PHASE.JUDGE)
      return
    }

    // Ok ve highlight göster, tahtayı güncelle
    setArrows([[from, to, 'rgb(100,100,255)']])
    setHighlightSquares({
      [from]: { background: 'rgba(150,150,255,0.5)' },
      [to]: { background: 'rgba(150,150,255,0.5)' },
    })
    gameRef.current = gameCopy
    setGame(gameCopy)

    setTimeout(() => {
      setArrows([])
      setHighlightSquares({})
      updatePhase(PHASE.JUDGE)
    }, 1500)
  }

  useEffect(() => { loadPuzzle() }, [])

  async function handleJudge(userSaysWinning) {
    const actuallyWinning = puzzleRef.current.has_winning_move
    if (userSaysWinning === actuallyWinning) {
      if (actuallyWinning) {
        updatePhase(PHASE.MOVE)
      } else {
        await finishPuzzle(true)
      }
    } else {
      const msg = actuallyWinning
        ? 'This position does have a winning move.'
        : 'This position does not have a winning move.'
      await finishPuzzle(false, msg)
    }
  }

  function playOpponentMove(chess, moves, nextIndex) {
    if (nextIndex >= moves.length) {
      finishPuzzle(true)
      return
    }

    setTimeout(() => {
      const uci = moves[nextIndex]
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promotion = uci[4] || undefined

      const gameCopy = new Chess(chess.fen())
      try {
        gameCopy.move({ from, to, promotion })
      } catch {
        finishPuzzle(true)
        return
      }

      gameRef.current = gameCopy
      setGame(gameCopy)
      setArrows([[from, to, 'rgb(100,100,255)']])
      setHighlightSquares({
        [from]: { background: 'rgba(150,150,255,0.4)' },
        [to]: { background: 'rgba(150,150,255,0.4)' },
      })

      const newIndex = nextIndex + 1
      moveIndexRef.current = newIndex

      if (newIndex >= moves.length) {
        setTimeout(() => {
          setArrows([])
          finishPuzzle(true)
        }, 600)
      } else {
        setTimeout(() => setArrows([]), 800)
      }
    }, 500)
  }

  function tryMove(from, to) {
    if (phaseRef.current !== PHASE.MOVE) return false

    const currentGame = gameRef.current
    if (!currentGame) return false

    const piece = currentGame.get(from)
    if (!piece || piece.color !== playerColorRef.current) return false

    const gameCopy = new Chess(currentGame.fen())
    let move = null
    try {
      move = gameCopy.move({ from, to, promotion: 'q' })
    } catch { return false }
    if (!move) return false

    const currentPuzzle = puzzleRef.current
    const moves = currentPuzzle.solution_moves ?? []
    const currentIndex = moveIndexRef.current
    const expectedUci = moves[currentIndex]

    const normalize = (s) => s?.replace(/[-\s]/g, '').toLowerCase().trim()
    const played = normalize(move.from + move.to + (move.promotion || ''))
    const expected = normalize(expectedUci)

    setSelectedSquare(null)
    setArrows([])

    if (!expected) {
      gameRef.current = gameCopy
      setGame(gameCopy)
      setHighlightSquares({
        [from]: { background: 'rgba(0,200,100,0.4)' },
        [to]: { background: 'rgba(0,200,100,0.4)' },
      })
      finishPuzzle(true)
      return true
    }

    if (played === expected) {
      gameRef.current = gameCopy
      setGame(gameCopy)
      setHighlightSquares({
        [from]: { background: 'rgba(0,200,100,0.4)' },
        [to]: { background: 'rgba(0,200,100,0.4)' },
      })
      const nextIndex = currentIndex + 1
      moveIndexRef.current = nextIndex
      playOpponentMove(gameCopy, moves, nextIndex)
    } else {
      setHighlightSquares({
        [from]: { background: 'rgba(220,50,50,0.4)' },
        [to]: { background: 'rgba(220,50,50,0.4)' },
      })
      setTimeout(() => {
        const f = expectedUci?.slice(0, 2)
        const t = expectedUci?.slice(2, 4)
        if (f && t) {
          setArrows([[f, t, 'rgb(255,180,0)']])
          setHighlightSquares({
            [f]: { background: 'rgba(255,200,0,0.5)' },
            [t]: { background: 'rgba(255,200,0,0.5)' },
          })
        }
      }, 600)
      const san = uciToSan(currentGame, expectedUci)
      finishPuzzle(false, `Wrong move. Correct: ${san}.`)
    }
    return true
  }

  function onDrop(from, to) { return tryMove(from, to) }

  function onSquareClick(square) {
    if (phaseRef.current !== PHASE.MOVE) return

    const chess = gameRef.current
    if (!chess) return

    if (selectedSquare) {
      const moved = tryMove(selectedSquare, square)
      if (!moved) {
        const piece = chess.get(square)
        if (piece && piece.color === playerColorRef.current) {
          setSelectedSquare(square)
          const moves = chess.moves({ square, verbose: true })
          const highlights = { [square]: { background: 'rgba(201,168,76,0.5)' } }
          moves.forEach(m => { highlights[m.to] = { background: 'rgba(201,168,76,0.25)', borderRadius: '50%' } })
          setHighlightSquares(highlights)
        } else {
          setSelectedSquare(null)
          setHighlightSquares({})
        }
      }
    } else {
      const piece = chess.get(square)
      if (piece && piece.color === playerColorRef.current) {
        setSelectedSquare(square)
        const moves = chess.moves({ square, verbose: true })
        const highlights = { [square]: { background: 'rgba(201,168,76,0.5)' } }
        moves.forEach(m => { highlights[m.to] = { background: 'rgba(201,168,76,0.25)', borderRadius: '50%' } })
        setHighlightSquares(highlights)
      }
    }
  }

  async function finishPuzzle(correct, message = '') {
    updatePhase(PHASE.RESULT)
    let delta = 0
    if (user && profile) {
      const currentPuzzle = puzzleRef.current
      delta = eloDiff(profile.elo, currentPuzzle.rating, correct)
      const newElo = calculateNewElo(profile.elo, currentPuzzle.rating, correct)
      await supabase.from('profiles').update({ elo: newElo }).eq('id', user.id)
      await supabase.from('puzzle_attempts').insert({
        user_id: user.id, puzzle_id: currentPuzzle.id,
        correct, player_elo_before: profile.elo,
      })
      await refreshProfile()
    }
    setResult({ correct, eloDelta: delta, message })
  }

  if (loading) return (
    <div className="puzzle-page">
      <div className="loading-state">
        <div className="loading-spinner" /><p>Loading puzzle…</p>
      </div>
    </div>
  )

  if (!puzzle) return (
    <div className="puzzle-page">
      <div className="loading-state"><p>No puzzles found.</p></div>
    </div>
  )

  const sideToMove = playerColor === 'w' ? 'White' : 'Black'

  return (
    <div className="puzzle-page">
      <div className="puzzle-layout">
        <div className="board-wrapper">
          <Chessboard
            animationDuration={300}
            boardWidth={480}
            position={game ? game.fen() : 'start'}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            boardOrientation={boardOrientation}
            arePiecesDraggable={phase === PHASE.MOVE}
            customArrows={arrows}
            customSquareStyles={highlightSquares}
            customBoardStyle={{ borderRadius: '4px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
            customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
        </div>

        <div className="puzzle-panel">
          <div className="puzzle-meta">
            <span className="puzzle-rating-badge">Puzzle {puzzle.rating}</span>
            {puzzle.themes?.length > 0 && <span className="puzzle-theme">{puzzle.themes[0]}</span>}
          </div>
          <div className="puzzle-prompt">
            <p className="prompt-side"><strong>{sideToMove}</strong> to move</p>

            {phase === PHASE.SETUP && (
              <div className="move-phase">
                <p className="prompt-hint">Loading position…</p>
              </div>
            )}

            {phase === PHASE.JUDGE && (
              <div className="judge-phase">
                <p className="prompt-question">Does this position have a winning move?</p>
                <div className="judge-buttons">
                  <button className="judge-btn judge-yes" onClick={() => handleJudge(true)}>✓ Yes, there is</button>
                  <button className="judge-btn judge-no" onClick={() => handleJudge(false)}>✗ No, it doesn't</button>
                </div>
              </div>
            )}

            {phase === PHASE.MOVE && (
              <div className="move-phase">
                <p className="prompt-question">Find the winning move.</p>
                <p className="prompt-hint">Click a piece, then click the destination.</p>
              </div>
            )}

            {phase === PHASE.RESULT && result && (
              <div className={`result-phase ${result.correct ? 'correct' : 'wrong'}`}>
                <div className="result-icon">{result.correct ? '✓' : '✗'}</div>
                <p className="result-label">{result.correct ? 'Correct!' : 'Incorrect'}</p>
                {result.message && <p className="result-message">{result.message}</p>}
                {user ? (
                  <div className={`elo-change ${result.eloDelta >= 0 ? 'gain' : 'loss'}`}>
                    {result.eloDelta >= 0 ? '+' : ''}{result.eloDelta} ELO
                  </div>
                ) : (
                  <p className="guest-note">Sign in to track your ELO</p>
                )}
                <button className="btn-primary next-btn" onClick={loadPuzzle}>Next Puzzle →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}