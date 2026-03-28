import { useState } from "react";
import { supabase } from "../lib/supabase";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function UsernameModal({ userId, onComplete }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = username.trim();

    if (!USERNAME_REGEX.test(trimmed)) {
      setError("3-20 characters, only letters, numbers and underscores.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", userId);

    if (dbError) {
      if (dbError.code === "23505") {
        setError("This username is already taken.");
      } else {
        setError("Something went wrong. Try again.");
      }
      setLoading(false);
      return;
    }

    onComplete(trimmed);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon">♟</div>
        <h2 className="modal-title">Choose a username</h2>
        <p className="modal-body">
          Pick a unique username. Only letters, numbers and underscores allowed.
        </p>

        <div className="username-input-wrap">
          <input
            className="username-input"
            type="text"
            placeholder="your_username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            maxLength={20}
            autoFocus
          />
          {error && <p className="username-error">{error}</p>}
        </div>

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={loading || !username.trim()}
          style={{ width: "100%", marginTop: "1rem" }}
        >
          {loading ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}