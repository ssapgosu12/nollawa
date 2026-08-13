interface VignetteProps {
  intensity: number;
  periodMs: number;
}

interface CountdownProps {
  remaining: number;
  visible: boolean;
}

export function Vignette({ intensity, periodMs }: VignetteProps) {
  return <div class="viewport-vignette" aria-hidden="true" style={`--vignette-intensity:${intensity};--vignette-period:${periodMs}ms`} />;
}

export function Countdown({ remaining, visible }: CountdownProps) {
  return visible ? <output class="viewport-countdown" aria-label="남은 시간">{remaining}</output> : null;
}
