import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="home">
      <div className="home-hero">
        <div className="hero-glyph">♟</div>
        <h1 className="hero-title">
          Not every position has a <em>winning move</em>.
        </h1>
        <p className="hero-subtitle">
          Classic puzzle trainers always guarantee a solution exists. DecoyPuzzle doesn't. Judge the position first — then find the move.
        </p>
        <button className="btn-primary" onClick={() => navigate('/puzzles')}>
          Start Playing
        </button>
      </div>

      <div className="home-features">
        <div className="feature-card">
          <span className="feature-icon">⚖</span>
          <h3>Judge first</h3>
          <p>Is there a winning move? Decide before you move. Wrong answer loses ELO regardless of what move you play.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🎯</span>
          <h3>Then find it</h3>
          <p>If you judged correctly, find the move. Puzzles are matched to your ELO and get harder as you improve.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">📈</span>
          <h3>Track progress</h3>
          <p>Sign in with Google to track your ELO across sessions. Play as guest anytime without an account.</p>
        </div>
      </div>
    </div>
  )
}