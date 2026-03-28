const MAX_ELO = 2900
const MIN_ELO = 100

// K faktörü: puzzles_solved ve playerElo'ya göre exponansiyel azalma
function getKFactor(puzzlesSolved, playerElo) {
  // Kalibrasyon fazı: ilk 30 bulmacada hızlı
  let k
  if (puzzlesSolved < 30) k = 64
  else if (puzzlesSolved < 100) k = 32
  else k = 16

  // Exponansiyel yavaşlama: 2000 ELO'dan itibaren başlar
  // 2900'de neredeyse sıfırlanır
  if (playerElo > 2000) {
    const decay = Math.exp(-((playerElo - 2000) / 300))
    k = k * decay
  }

  return Math.max(0.5, k) // minimum 0.5 — tamamen durmasın
}

export function calculateNewElo(playerElo, puzzleElo, won, puzzlesSolved = 0) {
  const k = getKFactor(puzzlesSolved, playerElo)
  const expected = 1 / (1 + Math.pow(10, (puzzleElo - playerElo) / 400))
  const actual = won ? 1 : 0
  const newElo = playerElo + k * (actual - expected)
  return Math.min(MAX_ELO, Math.max(MIN_ELO, Math.round(newElo)))
}

export function eloDiff(playerElo, puzzleElo, won, puzzlesSolved = 0) {
  return calculateNewElo(playerElo, puzzleElo, won, puzzlesSolved) - playerElo
}