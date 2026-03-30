import { useState, useEffect, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { calculateNewElo, eloDiff } from "../lib/elo";

const PHASE = { SETUP: "setup", JUDGE: "judge", MOVE: "move", RESULT: "result" };

function uciToSan(chess, uci) {
  try {
    const copy = new Chess(chess.fen());
    const move = copy.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || undefined });
    return move?.san ?? uci;
  } catch { return uci; }
}

function getNoWinProbability(consecutiveWins) {
  if (consecutiveWins <= 1) return 0.5;
  if (consecutiveWins === 2) return 0.75;
  if (consecutiveWins === 3) return 0.9;
  return 0.9;
}

function getWinProbability(consecutiveNoWins) {
  if (consecutiveNoWins <= 1) return 0.5;
  if (consecutiveNoWins === 2) return 0.75;
  if (consecutiveNoWins === 3) return 0.9;
  return 0.9;
}

export default function PuzzlePage() {
  const { user, profile, refreshProfile } = useAuth();

  const [puzzle, setPuzzle] = useState(null);
  const [fen, setFen] = useState(null);
  const [phase, setPhase] = useState(PHASE.SETUP);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardOrientation, setBoardOrientation] = useState("white");
  const [highlightSquares, setHighlightSquares] = useState({});
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [playerColor, setPlayerColor] = useState("w");
  const [arrows, setArrows] = useState([]);
  const [boardSize, setBoardSize] = useState(480);

  const phaseRef = useRef(PHASE.SETUP);
  const puzzleRef = useRef(null);
  const gameRef = useRef(null);
  const moveIndexRef = useRef(0);
  const playerColorRef = useRef("w");
  const judgmentRef = useRef(null);
  const hasMounted = useRef(false);
  const boardWrapperRef = useRef(null);
  const consecutiveWinsRef = useRef(0);
  const consecutiveNoWinsRef = useRef(0);

  useEffect(() => {
    function updateSize() {
      if (boardWrapperRef.current) {
        const w = boardWrapperRef.current.getBoundingClientRect().width;
        setBoardSize(Math.min(480, Math.floor(w)));
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [puzzle]);

  function updatePhase(p) {
    phaseRef.current = p;
    setPhase(p);
  }

  function shouldFetchNoWin() {
    const cw = consecutiveWinsRef.current;
    const cn = consecutiveNoWinsRef.current;
    if (cw > 0) return Math.random() < getNoWinProbability(cw);
    if (cn > 0) return Math.random() >= getWinProbability(cn);
    return Math.random() < 0.5;
  }

  const loadPuzzle = useCallback(async () => {
    updatePhase(PHASE.SETUP);
    setResult(null);
    setHighlightSquares({});
    setArrows([]);
    setSelectedSquare(null);
    moveIndexRef.current = 0;
    judgmentRef.current = null;
    setLoading(true);

    const playerElo = profile?.elo ?? 1200;
    const puzzlesSolved = profile?.puzzles_solved ?? 0;
    const range = puzzlesSolved < 30 ? 400 : 150;
    const jitter = Math.floor(Math.random() * 100) - 50;

    const fetchNoWin = shouldFetchNoWin();
    const hasWinningMove = !fetchNoWin;

    const minRating = hasWinningMove ? playerElo - range + jitter : 0;
    const maxRating = hasWinningMove ? playerElo + range + jitter : 9999;

    let { data } = user
      ? await supabase.rpc("get_unseen_puzzles", {
          p_user_id: user.id,
          p_min_rating: minRating,
          p_max_rating: maxRating,
          p_limit: 50,
          p_has_winning_move: hasWinningMove,
        })
      : await supabase
          .from("puzzles")
          .select("*")
          .eq("has_winning_move", hasWinningMove)
          .gte("rating", minRating)
          .lte("rating", maxRating)
          .limit(50);

    if (!data || data.length === 0) {
      const { data: fallback } = user
        ? await supabase.rpc("get_unseen_puzzles", {
            p_user_id: user.id,
            p_min_rating: 0,
            p_max_rating: 9999,
            p_limit: 20,
            p_has_winning_move: hasWinningMove,
          })
        : await supabase.from("puzzles").select("*").eq("has_winning_move", hasWinningMove).limit(20);
      data = fallback;
    }

    if (!data || data.length === 0) {
      const { data: lastResort } = await supabase.from("puzzles").select("*").limit(20);
      data = lastResort;
    }

    if (!data || data.length === 0) { setLoading(false); return; }

    const picked = data[Math.floor(Math.random() * data.length)];
    const opponentColor = new Chess(picked.fen).turn();
    const color = opponentColor === "w" ? "b" : "w";

    puzzleRef.current = picked;
    playerColorRef.current = color;
    setPlayerColor(color);
    setPuzzle(picked);
    setBoardOrientation(color === "w" ? "white" : "black");
    setFen(picked.fen);
    setLoading(false);

    const setupMove = picked.setup_move;
    if (!setupMove) { updatePhase(PHASE.JUDGE); return; }

    await new Promise((r) => setTimeout(r, 500));

    const chess = new Chess(picked.fen);
    try {
      chess.move({ from: setupMove.slice(0,2), to: setupMove.slice(2,4), promotion: setupMove[4] || undefined });
    } catch { updatePhase(PHASE.JUDGE); return; }

    gameRef.current = chess;
    setFen(chess.fen());

    const from = setupMove.slice(0, 2);
    const to = setupMove.slice(2, 4);
    setArrows([[from, to, "rgb(100,100,255)"]]);
    setHighlightSquares({
      [from]: { background: "rgba(150,150,255,0.5)" },
      [to]: { background: "rgba(150,150,255,0.5)" },
    });

    setTimeout(() => {
      setArrows([]);
      setHighlightSquares({});
      updatePhase(PHASE.JUDGE);
    }, 1500);
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      loadPuzzle();
    }
  }, []);

  async function handleJudge(userSaysWinning) {
    const actuallyWinning = puzzleRef.current.has_winning_move;
    const judgmentCorrect = userSaysWinning === actuallyWinning;
    judgmentRef.current = judgmentCorrect;

    if (judgmentCorrect) {
      if (actuallyWinning) { updatePhase(PHASE.MOVE); }
      else { await finishPuzzle(true, "", true); }
    } else {
      const msg = actuallyWinning
        ? "This position does have a winning move."
        : "This position does not have a winning move.";
      await finishPuzzle(false, msg, false);
    }
  }

  function playOpponentMove(chess, moves, nextIndex) {
    if (nextIndex >= moves.length) { finishPuzzle(true, "", judgmentRef.current); return; }

    setTimeout(() => {
      const uci = moves[nextIndex];
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci[4] || undefined;

      const gameCopy = new Chess(chess.fen());
      try { gameCopy.move({ from, to, promotion }); }
      catch { finishPuzzle(true, "", judgmentRef.current); return; }

      gameRef.current = gameCopy;
      setFen(gameCopy.fen());
      setArrows([[from, to, "rgb(100,100,255)"]]);
      setHighlightSquares({
        [from]: { background: "rgba(150,150,255,0.4)" },
        [to]: { background: "rgba(150,150,255,0.4)" },
      });

      const newIndex = nextIndex + 1;
      moveIndexRef.current = newIndex;

      if (newIndex >= moves.length) {
        setTimeout(() => { setArrows([]); finishPuzzle(true, "", judgmentRef.current); }, 600);
      } else {
        setTimeout(() => setArrows([]), 800);
      }
    }, 500);
  }

  function tryMove(from, to) {
    if (phaseRef.current !== PHASE.MOVE) return false;
    const currentGame = gameRef.current;
    if (!currentGame) return false;

    const piece = currentGame.get(from);
    if (!piece || piece.color !== playerColorRef.current) return false;

    const gameCopy = new Chess(currentGame.fen());
    let move = null;
    try { move = gameCopy.move({ from, to, promotion: "q" }); }
    catch { return false; }
    if (!move) return false;

    const currentPuzzle = puzzleRef.current;
    const moves = currentPuzzle.solution_moves ?? [];
    const currentIndex = moveIndexRef.current;
    const expectedUci = moves[currentIndex];

    const normalize = (s) => s?.replace(/[-\s]/g, "").toLowerCase().trim();
    const played = normalize(move.from + move.to + (move.promotion || ""));
    const expected = normalize(expectedUci);

    setSelectedSquare(null);
    setArrows([]);

    if (!expected) {
      gameRef.current = gameCopy;
      setFen(gameCopy.fen());
      setHighlightSquares({ [from]: { background: "rgba(0,200,100,0.4)" }, [to]: { background: "rgba(0,200,100,0.4)" } });
      finishPuzzle(true, "", judgmentRef.current);
      return true;
    }

    if (played === expected) {
      gameRef.current = gameCopy;
      setFen(gameCopy.fen());
      setHighlightSquares({ [from]: { background: "rgba(0,200,100,0.4)" }, [to]: { background: "rgba(0,200,100,0.4)" } });
      const nextIndex = currentIndex + 1;
      moveIndexRef.current = nextIndex;
      playOpponentMove(gameCopy, moves, nextIndex);
    } else {
      setHighlightSquares({ [from]: { background: "rgba(220,50,50,0.4)" }, [to]: { background: "rgba(220,50,50,0.4)" } });
      setTimeout(() => {
        const f = expectedUci?.slice(0, 2);
        const t = expectedUci?.slice(2, 4);
        if (f && t) {
          setArrows([[f, t, "rgb(255,180,0)"]]);
          setHighlightSquares({ [f]: { background: "rgba(255,200,0,0.5)" }, [t]: { background: "rgba(255,200,0,0.5)" } });
        }
      }, 600);
      const san = uciToSan(currentGame, expectedUci);
      finishPuzzle(false, `Wrong move. Correct: ${san}.`, judgmentRef.current);
    }
    return true;
  }

  function onDrop(from, to) { return tryMove(from, to); }

  function onSquareClick(square) {
    if (phaseRef.current !== PHASE.MOVE) return;
    const chess = gameRef.current;
    if (!chess) return;

    if (selectedSquare) {
      const moved = tryMove(selectedSquare, square);
      if (!moved) {
        const piece = chess.get(square);
        if (piece && piece.color === playerColorRef.current) {
          setSelectedSquare(square);
          const moves = chess.moves({ square, verbose: true });
          const highlights = { [square]: { background: "rgba(201,168,76,0.5)" } };
          moves.forEach((m) => { highlights[m.to] = { background: "rgba(201,168,76,0.25)", borderRadius: "50%" }; });
          setHighlightSquares(highlights);
        } else {
          setSelectedSquare(null);
          setHighlightSquares({});
        }
      }
    } else {
      const piece = chess.get(square);
      if (piece && piece.color === playerColorRef.current) {
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        const highlights = { [square]: { background: "rgba(201,168,76,0.5)" } };
        moves.forEach((m) => { highlights[m.to] = { background: "rgba(201,168,76,0.25)", borderRadius: "50%" }; });
        setHighlightSquares(highlights);
      }
    }
  }

  async function finishPuzzle(correct, message = "", judgmentCorrect = null) {
    updatePhase(PHASE.RESULT);

    const wasWin = puzzleRef.current?.has_winning_move;
    if (wasWin) {
      consecutiveWinsRef.current += 1;
      consecutiveNoWinsRef.current = 0;
    } else {
      consecutiveNoWinsRef.current += 1;
      consecutiveWinsRef.current = 0;
    }

    let delta = 0;
    if (user && profile) {
      const currentPuzzle = puzzleRef.current;
      delta = eloDiff(profile.elo, currentPuzzle.rating, correct, profile.puzzles_solved ?? 0);
      const newElo = calculateNewElo(profile.elo, currentPuzzle.rating, correct, profile.puzzles_solved ?? 0);
      const newSolved = correct ? (profile.puzzles_solved ?? 0) + 1 : (profile.puzzles_solved ?? 0);

      // Puzzle ELO'sunu da güncelle (ters: kullanıcı doğru yaparsa puzzle zorlaşır)
      const newPuzzleElo = calculateNewElo(currentPuzzle.rating, profile.elo, !correct, 100);
      await supabase.from("puzzles").update({ rating: newPuzzleElo }).eq("id", currentPuzzle.id);

      await supabase.from("profiles").update({ elo: newElo, puzzles_solved: newSolved }).eq("id", user.id);
      await supabase.from("puzzle_attempts").insert({
        user_id: user.id,
        puzzle_id: currentPuzzle.id,
        correct,
        judgment_correct: judgmentCorrect,
        player_elo_before: profile.elo,
      });
      await refreshProfile();
    }
    setResult({ correct, eloDelta: delta, message });
  }

  function openInLichess() {
    if (!puzzleRef.current) return;
    const p = puzzleRef.current;
    if (!p.setup_move) {
      const fen = p.fen.replace(/ /g, "_");
      window.open(`https://lichess.org/analysis/standard/${fen}`, "_blank");
      return;
    }
    // setup hamlesi uygulanmış FEN'i gönder
    const chess = new Chess(p.fen);
    try {
      chess.move({ from: p.setup_move.slice(0,2), to: p.setup_move.slice(2,4), promotion: p.setup_move[4] || undefined });
    } catch {}
    const fen = chess.fen().replace(/ /g, "_");
    window.open(`https://lichess.org/analysis/standard/${fen}`, "_blank");
  }

  if (loading) return (
    <div className="puzzle-page">
      <div className="loading-state">
        <div className="loading-spinner" /><p>Loading puzzle…</p>
      </div>
    </div>
  );

  if (!puzzle) return (
    <div className="puzzle-page">
      <div className="loading-state"><p>No puzzles found.</p></div>
    </div>
  );

  const sideToMove = playerColor === "w" ? "White" : "Black";

  return (
    <div className="puzzle-page">
      <div className="puzzle-layout">
        <div className="board-wrapper" ref={boardWrapperRef}>
          <Chessboard
            animationDuration={400}
            boardWidth={boardSize}
            position={fen || "start"}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            boardOrientation={boardOrientation}
            arePiecesDraggable={phase === PHASE.MOVE}
            customArrows={arrows}
            customSquareStyles={highlightSquares}
            customBoardStyle={{ borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}
            customDarkSquareStyle={{ backgroundColor: "#c17453" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />
        </div>

        <div className="puzzle-panel" style={boardSize < 480 ? { position: "static", width: boardSize + "px", transform: "none", left: "auto", top: "auto" } : {}}>
          <div className="puzzle-prompt">
            <p className="prompt-side"><strong>{sideToMove}</strong> to move</p>

            {phase === PHASE.SETUP && <div className="move-phase"><p className="prompt-hint">Loading position…</p></div>}

            {phase === PHASE.JUDGE && (
              <>
                <p className="prompt-question">Does this position have a winning move?</p>
                <div className="judge-buttons">
                  <button className="judge-btn judge-yes" onClick={() => handleJudge(true)}>✓ Yes, there is</button>
                  <button className="judge-btn judge-no" onClick={() => handleJudge(false)}>✗ No, it doesn't</button>
                </div>
              </>
            )}

            {phase === PHASE.MOVE && (
              <div className="move-phase">
                <p className="prompt-question">Find the winning move.</p>
                <p className="prompt-hint">Click a piece, then click the destination.</p>
              </div>
            )}

            {phase === PHASE.RESULT && result && (
              <div className={`result-phase ${result.correct ? "correct" : "wrong"}`}>
                <div className="result-icon">{result.correct ? "✓" : "✗"}</div>
                <p className="result-label">{result.correct ? "Correct!" : "Incorrect"}</p>
                {result.message && <p className="result-message">{result.message}</p>}
                {user ? (
                  <div className={`elo-change ${result.eloDelta >= 0 ? "gain" : "loss"}`}>
                    {result.eloDelta >= 0 ? "+" : ""}{result.eloDelta} ELO
                  </div>
                ) : (
                  <p className="guest-note">Sign in to track your ELO</p>
                )}
                <button
                  className="btn-secondary"
                  onClick={openInLichess}
                  style={{ width: "100%", marginTop: "0.5rem" }}
                >
                  ↗ Open in Lichess
                </button>
                <button className="btn-primary next-btn" onClick={loadPuzzle}>Next Puzzle →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}