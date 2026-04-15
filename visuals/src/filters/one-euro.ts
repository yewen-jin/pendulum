// One-euro filter (Casiez et al., CHI 2012).
//
// Adaptive low-pass: cutoff frequency rises with signal velocity. At
// rest the cutoff is `mincutoff` Hz (heavy smoothing → no jitter); on
// fast motion the cutoff is `mincutoff + beta · |dx/dt|` (light
// smoothing → no lag). This is the right primitive for noisy inputs
// like MediaPipe landmarks and audio envelopes — a fixed-α one-pole
// always trades jitter for lag, the one-euro doesn't.
//
// Reference: http://cristal.univ-lille.fr/~casiez/1euro/

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  /**
   * @param mincutoff cutoff at zero velocity, in Hz. Lower = more
   *                  smoothing when still. ~1.0 is a sensible default.
   * @param beta      how fast cutoff rises with velocity. Higher = less
   *                  lag during fast motion. ~0.01 for landmarks,
   *                  ~1.0 for fast envelopes like audio RMS.
   * @param dcutoff   cutoff for the velocity estimate itself (Hz).
   */
  constructor(
    private mincutoff = 1.0,
    private beta = 0.01,
    private dcutoff = 1.0,
  ) {}

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
  }

  /** Change the cutoff parameters live without resetting filter state. */
  configure(mincutoff: number, beta: number): void {
    this.mincutoff = mincutoff;
    this.beta = beta;
  }

  /** Filter one sample. `tNow` in seconds (any monotonic clock). */
  filter(x: number, tNow: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tNow;
      return x;
    }
    const dt = Math.max(1e-3, tNow - this.tPrev);
    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dcutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.mincutoff + this.beta * Math.abs(dxHat);
    const a = alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tNow;
    return xHat;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

// ---- Landmark-array helper -------------------------------------------------

type LM = { x: number; y: number; z?: number };

/** Bank of one-euro filters for an array of (x, y, z?) landmarks.
 *  Pre-allocates 3 filters per landmark so per-frame `apply()` is
 *  allocation-free aside from the output shell. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][];

  constructor(count: number, mincutoff = 1.0, beta = 0.01) {
    this.filters = new Array(count);
    for (let i = 0; i < count; i++) {
      this.filters[i] = [
        new OneEuroFilter(mincutoff, beta),
        new OneEuroFilter(mincutoff, beta),
        new OneEuroFilter(mincutoff, beta),
      ];
    }
  }

  reset(): void {
    for (const triple of this.filters) for (const f of triple) f.reset();
  }

  /** Retune every underlying filter live. Does not disturb running state. */
  configure(mincutoff: number, beta: number): void {
    for (const triple of this.filters) {
      for (const f of triple) f.configure(mincutoff, beta);
    }
  }

  /** Filter every landmark in `lm` at time `tNow` (seconds). Returns a
   *  freshly-allocated array; callers may keep the reference because we
   *  never mutate the returned objects after returning. */
  apply(lm: LM[], tNow: number): LM[] {
    const out: LM[] = new Array(lm.length);
    for (let i = 0; i < lm.length && i < this.filters.length; i++) {
      const f = this.filters[i];
      const z = lm[i].z;
      out[i] = {
        x: f[0].filter(lm[i].x, tNow),
        y: f[1].filter(lm[i].y, tNow),
        z: z !== undefined ? f[2].filter(z, tNow) : undefined,
      };
    }
    return out;
  }
}
