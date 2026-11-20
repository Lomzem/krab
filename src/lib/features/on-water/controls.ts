export const FOCUS =
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring';

export const FOCUS_INSET =
  'focus-visible:outline-3 focus-visible:-outline-offset-6 focus-visible:outline-ring';

export const FOCUS_INVERSE =
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-inverse-action';

export const CHOICE_FOCUS =
  'has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-ring';

export const CHOICE_FOCUS_INSET =
  'has-focus-visible:outline-3 has-focus-visible:-outline-offset-6 has-focus-visible:outline-ring';

export const MAP_FOCUS =
  'focus-visible:outline-none focus-visible:shadow-[0_0_0_calc(var(--map-ring-inner,0px)+3px)_var(--ring-map-separator),0_0_0_calc(var(--map-ring-inner,0px)+6px)_var(--ring-map)]';

export const PIN_FOCUS =
  'group-focus-visible:shadow-[0_0_0_calc(var(--map-ring-inner,0px)+3px)_var(--ring-map-separator),0_0_0_calc(var(--map-ring-inner,0px)+6px)_var(--ring-map)]';

export const PRESS =
  'active:transition-[background-color,filter] active:duration-(--motion-press) active:ease-out';

const SHAPE = `inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-control px-4 text-control font-semibold ${FOCUS} ${PRESS} aria-disabled:opacity-60`;

export const ACTION_BUTTON = `${SHAPE} bg-action text-action-foreground active:brightness-95`;

export const QUIET_BUTTON = `${SHAPE} border border-input bg-card text-foreground active:bg-muted`;

export const DESTRUCTIVE_BUTTON = `${SHAPE} border border-destructive bg-card text-destructive active:bg-muted`;

export const DESTRUCTIVE_TEXT_BUTTON = `${SHAPE} text-destructive active:bg-muted`;

export const PRIMARY_BUTTON = `${SHAPE} border border-primary bg-card text-primary active:bg-muted`;

export const DAY_CHOICE =
  'relative flex min-h-12 touch-manipulation items-center justify-center gap-1 rounded-control border border-input bg-card px-2 text-center text-base font-medium has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground';
