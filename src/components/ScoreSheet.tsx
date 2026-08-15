import type { ComponentChildren } from 'preact';

interface Props {
  open: boolean;
  locked?: boolean;
  onOpenChange: (open: boolean) => void;
  children: ComponentChildren;
  label?: string;
  panelClass?: string;
  handleClass?: string;
}

export function nextScoreSheetOpen(open: boolean, locked = false): boolean {
  return locked ? open : !open;
}

export function ScoreSheet({ open, locked = false, onOpenChange, children, label = '점수판', panelClass = '', handleClass = '' }: Props) {
  const panelClasses = ['score-sheet-panel', panelClass].filter(Boolean).join(' ');
  const handleClasses = ['score-sheet-handle', handleClass].filter(Boolean).join(' ');
  return <>
    {open && <div class={panelClasses} aria-label={label}>{children}</div>}
    <button type="button" class={handleClasses} aria-expanded={open} disabled={locked} onClick={() => onOpenChange(nextScoreSheetOpen(open, locked))}>
      {label} {open ? '내리기' : '올리기'}
    </button>
  </>;
}
