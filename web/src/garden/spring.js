/**
 * A damped spring: chases its target, overshoots a little and settles. Used
 * for everything that should feel like it has weight (leaning into turns,
 * ears flopping, a head lagging behind the body) instead of moving rigidly.
 *
 *   const s = spring({ stiffness: 120, damping: 12 });
 *   s.target = 1; s.update(dt); s.value
 */
export function spring({ stiffness = 120, damping = 14, value = 0 } = {}) {
  return {
    value,
    velocity: 0,
    target: value,
    /** Gives the spring a push, e.g. a squash on landing. */
    kick(v) {
      this.velocity += v;
    },
    update(dt) {
      // Small fixed sub-steps keep stiff springs stable when a frame runs long.
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        this.velocity += (stiffness * (this.target - this.value) - damping * this.velocity) * h;
        this.value += this.velocity * h;
        left -= h;
      }
      return this.value;
    },
  };
}
