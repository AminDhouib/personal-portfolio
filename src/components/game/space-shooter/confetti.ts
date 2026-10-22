// Deterministic confetti pieces — angle + distance per piece, no Math.random
// during render (would trip react-hooks/purity).
export function buildConfetti(count: number, dist: number) {
  const colors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899", "#22d3ee"];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 4) * 0.3;
    const d = dist * (0.7 + (i % 5) * 0.12);
    return {
      id: i,
      dx: Math.cos(angle) * d,
      dy: Math.sin(angle) * d - 80,
      rot: (i * 53) % 360,
      color: colors[i % colors.length],
    };
  });
}
