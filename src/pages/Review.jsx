import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

function uciToSan(chess, uci) {
  try {
    const copy = new Chess(chess.fen());
    const move = copy.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

export default function Review() {
  const { attemptId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [puzzle, setPuzzle] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [positions, setPositions] = useState([]); // array of { fen, san, moveIndex }
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState("white");
  const [boardSize, setBoardSize] = useState(480);
  const [loading, setLoading] = useState(true);

  const boardWrapperRef = useRef(null);

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

  useEffect(() => {
  function handleKey(e) {
    if (e.key === "ArrowLeft") goTo(currentIndex - 1);
    if (e.key === "ArrowRight") goTo(currentIndex + 1);
    if (e.key === "ArrowUp" || e.key === "Home") goTo(0);
    if (e.key === "ArrowDown" || e.key === "End") goTo(positions.length - 1);
  }
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [currentIndex, positions.length]);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    fetchAttempt();
  }, [user, attemptId]);

  async function fetchAttempt() {
    setLoading(true);
    const { data } = await supabase
      .from("puzzle_attempts")
      .select(
        "*, puzzles(id, fen, setup_move, solution_moves, rating, themes, has_winning_move)",
      )
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .single();

    if (!data || !data.puzzles) {
      navigate("/profile");
      return;
    }

    setAttempt(data);
    const p = data.puzzles;
    setPuzzle(p);

    // Determine orientation
    const chess = new Chess(p.fen);
    const opponentColor = chess.turn();
    const playerColor = opponentColor === "w" ? "b" : "w";
    setBoardOrientation(playerColor === "w" ? "white" : "black");

    // Build positions array
    const pos = [];
    const game = new Chess(p.fen);

    // Position 0: before setup move
    pos.push({ fen: p.fen, san: null, label: "Start", type: "start" });

    // After setup move
    if (p.setup_move) {
      const san = uciToSan(game, p.setup_move);
      try {
        game.move({
          from: p.setup_move.slice(0, 2),
          to: p.setup_move.slice(2, 4),
          promotion: p.setup_move[4] || undefined,
        });
      } catch {}
      pos.push({
        fen: game.fen(),
        san,
        label: san,
        type: "setup",
        uci: p.setup_move,
      });
    }

    // Solution moves
    if (p.solution_moves) {
      p.solution_moves.forEach((uci, i) => {
        const san = uciToSan(game, uci);
        try {
          game.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || undefined,
          });
        } catch {}
        const isPlayerMove = i % 2 === 0; // solution_moves[0] her zaman player'ın hamlesi
        pos.push({
          fen: game.fen(),
          san,
          label: san,
          type: isPlayerMove ? "you" : "opponent",
          uci,
        });
      });
    }

    setPositions(pos);
    setCurrentIndex(p.setup_move ? 1 : 0); // start after setup move
    setLoading(false);
  }

  function goTo(index) {
    if (index < 0 || index >= positions.length) return;
    setCurrentIndex(index);
  }

  function downloadFen() {
    if (!puzzle) return;
    const blob = new Blob([puzzle.fen], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `puzzle_${puzzle.id}.fen`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openLichess() {
  if (!puzzle) return;
  // setup hamlesi sonrası pozisyonu gönder
  const startFen = positions[1]?.fen || puzzle.fen;
  const fen = startFen.replace(/ /g, "_");
  window.open(`https://lichess.org/analysis/standard/${fen}`, "_blank");
}

  // Group moves into pairs (white/black) for display — skip "start"
  function getMoveRows() {
    const movesOnly = positions.slice(1); // skip start
    const rows = [];
    for (let i = 0; i < movesOnly.length; i += 2) {
      rows.push({
        number: Math.floor(i / 2) + 1,
        white: movesOnly[i] ? { ...movesOnly[i], posIndex: i + 1 } : null,
        black: movesOnly[i + 1]
          ? { ...movesOnly[i + 1], posIndex: i + 2 }
          : null,
      });
    }
    return rows;
  }

  if (loading || !puzzle)
    return (
      <div className="puzzle-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );

  const currentFen = positions[currentIndex]?.fen || puzzle.fen;
  const moveRows = getMoveRows();

  return (
    <div className="review-page">
      <div className="review-layout">
        <div className="board-wrapper" ref={boardWrapperRef}>
          <Chessboard
            animationDuration={200}
            boardWidth={boardSize}
            position={currentFen}
            boardOrientation={boardOrientation}
            arePiecesDraggable={false}
            customBoardStyle={{
              borderRadius: "4px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            }}
            customDarkSquareStyle={{ backgroundColor: "#c17453" }}
            customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
          />

          {/* Navigation controls */}
          <div className="review-nav">
            <button
              className="review-nav-btn"
              onClick={() => goTo(0)}
              disabled={currentIndex === 0}
            >
              ⏮
            </button>
            <button
              className="review-nav-btn"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              ◀
            </button>
            <span className="review-nav-label">
              {currentIndex === 0 ? "Start" : `Move ${currentIndex}`}
            </span>
            <button
              className="review-nav-btn"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === positions.length - 1}
            >
              ▶
            </button>
            <button
              className="review-nav-btn"
              onClick={() => goTo(positions.length - 1)}
              disabled={currentIndex === positions.length - 1}
            >
              ⏭
            </button>
          </div>
        </div>

        <div className="review-panel">
          <div className="puzzle-meta">
            <span className="puzzle-rating-badge">{puzzle.rating}</span>
            {puzzle.themes?.length > 0 && (
              <span className="puzzle-theme">{puzzle.themes[0]}</span>
            )}
            {attempt && (
              <span
                className={`puzzle-rating-badge ${attempt.correct ? "correct-badge" : "wrong-badge"}`}
              >
                {attempt.correct ? "✓ Solved" : "✗ Failed"}
              </span>
            )}
          </div>

          <div className="review-moves">
            <h3 className="review-moves-title">Moves</h3>
            <div className="moves-table">
              {moveRows.map((row) => (
                <div key={row.number} className="moves-row">
                  <span className="moves-row-number">{row.number}.</span>
                  <button
                    className={`move-cell ${row.white?.type} ${currentIndex === row.white?.posIndex ? "active" : ""}`}
                    onClick={() => row.white && goTo(row.white.posIndex)}
                  >
                    {row.white?.san ?? "—"}
                  </button>
                  <button
                    className={`move-cell ${row.black?.type} ${currentIndex === row.black?.posIndex ? "active" : ""}`}
                    onClick={() => row.black && goTo(row.black.posIndex)}
                    disabled={!row.black}
                  >
                    {row.black?.san ?? ""}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="review-actions">
            <button
              className="btn-secondary"
              onClick={downloadFen}
              style={{ width: "100%" }}
            >
              ↓ Download FEN
            </button>
            <button
              className="btn-secondary"
              onClick={openLichess}
              style={{ width: "100%" }}
            >
              ↗ Open in Lichess
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate("/profile")}
              style={{ width: "100%" }}
            >
              ← Back to profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
