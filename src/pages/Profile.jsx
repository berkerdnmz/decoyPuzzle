import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

const PAGE_SIZE = 10;

function getPuzzleFen(attempt) {
  // Show position after setup move
  const p = attempt.puzzles;
  if (!p?.fen) return null;
  if (!p.setup_move) return p.fen;
  try {
    const chess = new Chess(p.fen);
    chess.move({
      from: p.setup_move.slice(0, 2),
      to: p.setup_move.slice(2, 4),
      promotion: p.setup_move[4] || undefined,
    });
    return chess.fen();
  } catch {
    return p.fen;
  }
}

function getPuzzleOrientation(attempt) {
  const p = attempt.puzzles;
  if (!p?.fen) return "white";
  const chess = new Chess(p.fen);
  const opponentColor = chess.turn();
  return opponentColor === "w" ? "black" : "white";
}

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const DELETE_PHRASE = "I confirm account deletion";

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    fetchStats();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchAttempts(page);
  }, [user, page]);

  async function fetchStats() {
    setLoading(true);
    const { data: allAttempts } = await supabase
      .from("puzzle_attempts")
      .select("correct, judgment_correct")
      .eq("user_id", user.id);

    if (allAttempts) {
      const total = allAttempts.length;
      const correct = allAttempts.filter((a) => a.correct).length;
      const judgmentTotal = allAttempts.filter(
        (a) => a.judgment_correct !== null,
      ).length;
      const judgmentCorrect = allAttempts.filter(
        (a) => a.judgment_correct === true,
      ).length;
      setTotalAttempts(total);
      setStats({
        total,
        correct,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        judgmentTotal,
        judgmentAccuracy:
          judgmentTotal > 0
            ? Math.round((judgmentCorrect / judgmentTotal) * 100)
            : 0,
      });
    }
    setLoading(false);
  }

  async function fetchAttempts(pageNum) {
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("puzzle_attempts")
      .select(
        "id, correct, judgment_correct, player_elo_before, created_at, puzzle_id, puzzles(id, rating, themes, fen, setup_move, solution_moves, has_winning_move)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    setAttempts(data ?? []);
  }

  async function handleDeleteAccount() {
    if (deleteInput !== DELETE_PHRASE) return;
    setDeleting(true);
    await supabase.rpc("delete_user");
    await supabase.auth.signOut();
    navigate("/");
  }

  if (!user) return null;

  const totalPages = Math.ceil(totalAttempts / PAGE_SIZE);
  const displayName =
    profile?.username ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0];

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div>
          <h1 className="profile-name">{profile?.username ?? displayName}</h1>
          <p className="profile-email">{user.email}</p>
        </div>
        <div className="profile-elo-big">
          <span className="elo-label">ELO</span>
          <span className="elo-number">{profile?.elo ?? "—"}</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-state" style={{ minHeight: "200px" }}>
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="profile-stats">
            <div className="stat-card">
              <span className="stat-value">{stats?.total ?? 0}</span>
              <span className="stat-label">Puzzles played</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats?.accuracy ?? 0}%</span>
              <span className="stat-label">Overall accuracy</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {stats?.judgmentAccuracy ?? 0}%
              </span>
              <span className="stat-label">Judgment accuracy</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{profile?.puzzles_solved ?? 0}</span>
              <span className="stat-label">Puzzles solved</span>
            </div>
          </div>

          <div className="profile-section">
            <h2>Puzzles</h2>
            {attempts.length === 0 ? (
              <p className="profile-empty">No puzzles played yet.</p>
            ) : (
              <>
                <div className="puzzle-cards">
                  {attempts.map((a, i) => {
                    const fen = getPuzzleFen(a);
                    const orientation = getPuzzleOrientation(a);
                    return (
                      <div
                        key={i}
                        className={`puzzle-card ${a.correct ? "correct" : "wrong"}`}
                        onClick={() => navigate(`/review/${a.id}`)}
                      >
                        <div className="puzzle-card-board">
                          {fen && (
                            <Chessboard
                              boardWidth={100}
                              position={fen}
                              boardOrientation={orientation}
                              arePiecesDraggable={false}
                              customBoardStyle={{ borderRadius: "3px" }}
                              customDarkSquareStyle={{
                                backgroundColor: "#c17453",
                              }}
                              customLightSquareStyle={{
                                backgroundColor: "#f0d9b5",
                              }}
                            />
                          )}
                        </div>
                        <div className="puzzle-card-info">
                          <span className="puzzle-card-rating">
                            Puzzle {a.puzzles?.rating}
                          </span>
                          <span className="puzzle-card-elo">
                            ELO {a.player_elo_before}
                          </span>
                          <span className="puzzle-card-date">
                            {new Date(a.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="puzzle-card-badges">
                          <span className="puzzle-card-winning">
                            {a.puzzles?.has_winning_move ? "There is a winning move" : "No possible winning move"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      className="page-btn"
                      onClick={() => setPage(0)}
                      disabled={page === 0}
                    >
                      ⏮
                    </button>
                    <button
                      className="page-btn"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={page === 0}
                    >
                      ◀
                    </button>
                    <span className="page-label">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      className="page-btn"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= totalPages - 1}
                    >
                      ▶
                    </button>
                    <button
                      className="page-btn"
                      onClick={() => setPage(totalPages - 1)}
                      disabled={page >= totalPages - 1}
                    >
                      ⏭
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="profile-actions">
            <button className="btn-signout" onClick={signOut}>
              Sign out
            </button>
            <button className="btn-delete" onClick={() => setConfirmOpen(true)}>
              Delete account
            </button>
          </div>
        </>
      )}

      {confirmOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setConfirmOpen(false);
            setDeleteInput("");
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete account</h2>
            <p className="modal-body">
              This will permanently delete all your data and cannot be undone.
            </p>
            <p className="modal-body">
              To confirm, type:{" "}
              <strong style={{ color: "var(--text)" }}>{DELETE_PHRASE}</strong>
            </p>
            <div className="username-input-wrap">
              <input
                className="username-input"
                type="text"
                placeholder={DELETE_PHRASE}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setConfirmOpen(false);
                  setDeleteInput("");
                }}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn-delete"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteInput !== DELETE_PHRASE}
                style={{ flex: 1 }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
