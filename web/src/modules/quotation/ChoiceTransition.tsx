import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import './choice-transition.css';

export function SelectionMark() {
  return (
    <svg className="quote-selection-mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m7 12 3.3 3.3L17 8.6" />
    </svg>
  );
}

export function ChoiceTransition({
  expanded,
  confirmed = false,
  summary,
  children,
}: {
  expanded: boolean;
  confirmed?: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const options = useRef<HTMLDivElement>(null);
  const previouslyExpanded = useRef(expanded);
  useEffect(() => {
    if (
      expanded &&
      !previouslyExpanded.current &&
      !options.current?.contains(document.activeElement)
    ) {
      const legend = options.current?.closest('fieldset')?.querySelector('legend');
      if (legend) {
        legend.tabIndex = -1;
        legend.focus({ preventScroll: true });
      }
    }
    previouslyExpanded.current = expanded;
  }, [expanded]);

  return (
    <>
      <div
        className="quote-choice-panel quote-choice-summary"
        data-open={!expanded}
        data-confirmed={confirmed}
        aria-hidden={expanded}
        inert={expanded}
      >
        <div className="quote-choice-panel-inner">{summary}</div>
      </div>
      <div
        ref={options}
        className="quote-choice-panel quote-choice-options"
        data-open={expanded}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="quote-choice-panel-inner">{children}</div>
      </div>
    </>
  );
}

export function confirmRadioChoice(
  event: KeyboardEvent<HTMLInputElement>,
  checked: boolean,
  confirm: () => void,
) {
  if (event.key === 'Enter' || (event.key === ' ' && checked)) {
    event.preventDefault();
    confirm();
  }
}
