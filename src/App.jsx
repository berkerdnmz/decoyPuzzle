import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import UsernameModal from './components/Usernamemodal'
import Home from './pages/Home'
import Puzzle from './pages/Puzzle'
import About from './pages/About'
import Profile from './pages/Profile'
import Review from './pages/Review'
import './App.css'

function AppContent() {
  const { user, profile, refreshProfile } = useAuth()
  const needsUsername = user && profile && !profile.username

  console.log('profile:', profile)
  console.log('needsUsername:', needsUsername)

  return (
    <div className="app">
      <Navbar />
      {needsUsername && (
        <UsernameModal
          userId={user.id}
          onComplete={() => refreshProfile()}
        />
      )}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/puzzles" element={<Puzzle />} />
          <Route path="/about" element={<About />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/review/:attemptId" element={<Review />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}