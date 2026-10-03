import type { Waypoint } from './types';
import { distanceBetween } from '../utils/geo';

/** Shape-preserving cubic interpolation: retain measured points, avoid altitude overshoot. */
export function smoothPath(points: Waypoint[]): Waypoint[] {
  if (points.length < 3) return points.map(p => ({ ...p }));
  const positions = [0];
  const longitudes = [points[0].lng];
  for (let i = 1; i < points.length; i++) {
    positions.push(positions[i - 1] + Math.max(1, Math.hypot(
      distanceBetween(points[i - 1], points[i]), points[i].altitude - points[i - 1].altitude)));
    longitudes.push(longitudes[i - 1] + ((points[i].lng - points[i - 1].lng + 540) % 360 - 180));
  }
  const values = [points.map(p => p.lat), longitudes, points.map(p => p.altitude)];
  const slopes = values.map(v => {
    const d = v.slice(1).map((value, i) => (value - v[i]) / (positions[i + 1] - positions[i]));
    return v.map((_, i) => {
      if (i === 0) return d[0];
      if (i === v.length - 1) return d.at(-1)!;
      if (d[i - 1] * d[i] <= 0) return 0;
      const before = positions[i] - positions[i - 1], after = positions[i + 1] - positions[i];
      const w1 = 2 * after + before, w2 = after + 2 * before;
      return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    });
  });
  const result: Waypoint[] = [{ ...points[0] }];
  for (let i = 0; i < points.length - 1; i++) {
    const length = positions[i + 1] - positions[i];
    // Densify corners and long segments without unbounded global-route geometry.
    const samples = Math.min(24, Math.max(4, Math.ceil(length / 1500)));
    for (let j = 1; j < samples; j++) {
      const t = j / samples, t2 = t * t, t3 = t2 * t;
      const interpolated = values.map((v, axis) =>
        (2*t3-3*t2+1)*v[i] + (t3-2*t2+t)*length*slopes[axis][i]
        + (-2*t3+3*t2)*v[i+1] + (t3-t2)*length*slopes[axis][i+1]);
      result.push({lat: interpolated[0], lng: ((interpolated[1]+540)%360)-180, altitude: interpolated[2]});
    }
    result.push({ ...points[i + 1] });
  }
  return result;
}
