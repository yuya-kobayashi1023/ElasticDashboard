/** Running total; blanks (NaN) add nothing and show the total so far. */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => {
    if (!Number.isNaN(v)) sum += v;
    return sum;
  });
}

/**
 * Trailing moving average over `n` points. The first n - 1 points have no full window and stay NaN;
 * blanks inside a window are skipped, and a window with no values is NaN.
 */
export function movingAverage(values: number[], n: number): number[] {
  const size = Math.max(1, Math.floor(n));
  return values.map((_, i) => {
    if (i < size - 1) return NaN;
    let sum = 0;
    let count = 0;
    for (let j = i - size + 1; j <= i; j++) {
      if (Number.isNaN(values[j])) continue;
      sum += values[j];
      count++;
    }
    return count === 0 ? NaN : sum / count;
  });
}

export interface Regression {
  slope: number;
  intercept: number;
  /** Pearson correlation coefficient */
  r: number;
}

/** Least-squares line of y on x; null with fewer than two points or when x or y does not vary. */
export function linearRegression(xs: ArrayLike<number>, ys: ArrayLike<number>): Regression | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}
