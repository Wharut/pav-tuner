// Tiny canvas particle system for the "feather locked" and "all tuned" moments.

const COLORS = ['#fac409', '#ff4422', '#49c3f2', '#ff5a14', '#f4ffe4', '#3d8d7a', '#0091c8'];
const INK = '#0a0a3c';

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let particles = [];
  let running = false;
  let last = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function star(size) {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? size * 0.4 : size;
      const a = (i * Math.PI) / 8;
      ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function eye(size) {
    const rings = [['#3d8d7a', 1], ['#fac409', 0.72], ['#0091c8', 0.5], ['#001482', 0.3]];
    rings.forEach(([color, k], i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, i * size * 0.06, size * 0.7 * k, size * k, 0, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) ctx.stroke();
    });
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 60);
    for (const p of particles) {
      p.vy += 900 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.color;
      p.shape === 'eye' ? eye(p.size) : star(p.size);
      ctx.restore();
    }
    if (particles.length) requestAnimationFrame(tick);
    else {
      running = false;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  /** Throws `count` stars and feather eyes out of the point (x, y) in viewport pixels. */
  function burst(x, y, count = 18, power = 1) {
    if (reduce.matches) return;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = (220 + Math.random() * 420) * power;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * 6.3,
        spin: (Math.random() - 0.5) * 9,
        life: 1.1 + Math.random() * 0.9,
        size: 6 + Math.random() * 8,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        shape: Math.random() < 0.3 ? 'eye' : 'star',
      });
    }
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }
  }

  return { burst };
}
