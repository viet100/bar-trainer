import type { ReactNode } from "react";

type HoldButtonProps = {
  label: string;
  held: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
  children: ReactNode;
};

const isHoldKey = (key: string) => key === " " || key === "Enter";

// A button you press and hold (mouse, touch, or Space/Enter) instead of click.
export default function HoldButton({ label, held, onStart, onStop, className, children }: HoldButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={held}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Capture keeps pointerup coming to us even if the cursor drifts off the button.
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onLostPointerCapture={onStop}
      onKeyDown={(e) => {
        if (!isHoldKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) onStart();
      }}
      onKeyUp={(e) => isHoldKey(e.key) && onStop()}
      onBlur={onStop}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-none select-none ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
