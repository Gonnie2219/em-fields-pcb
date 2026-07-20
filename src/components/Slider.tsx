interface SliderProps {
  label: string;
  /** Current value in the same units as min/max. */
  value: number;
  min: number;
  max: number;
  /** Linear step; ignored when log is set. */
  step?: number;
  /** Logarithmic slider: min/max are real values, the track moves in log10. */
  log?: boolean;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

const LOG_STEPS = 300;

export function Slider({ label, value, min, max, step, log, format, onChange }: SliderProps) {
  const toTrack = (v: number) =>
    log ? ((Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * LOG_STEPS : v;
  const fromTrack = (t: number) =>
    log ? 10 ** (Math.log10(min) + (t / LOG_STEPS) * (Math.log10(max) - Math.log10(min))) : t;

  return (
    <div className="control">
      <label>
        <span>{label}</span>
        <span className="value">{format(value)}</span>
      </label>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : step ?? 'any'}
        value={toTrack(value)}
        onChange={(e) => onChange(fromTrack(Number(e.target.value)))}
      />
    </div>
  );
}
