import { FOCUS, PRESS } from '#lib/shared/control-states.js';

const SHAPE = `inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-control px-4 text-control font-semibold ${FOCUS} ${PRESS} aria-disabled:opacity-60`;

export const ACTION_BUTTON = `${SHAPE} bg-action text-action-foreground active:brightness-95`;

export const QUIET_BUTTON = `${SHAPE} border border-input bg-card text-foreground active:bg-muted`;

export const DESTRUCTIVE_BUTTON = `${SHAPE} border border-destructive bg-card text-destructive active:bg-muted`;

export const DESTRUCTIVE_TEXT_BUTTON = `${SHAPE} text-destructive active:bg-muted`;

export const PRIMARY_BUTTON = `${SHAPE} border border-primary bg-card text-primary active:bg-muted`;

export const DAY_CHOICE =
  'relative flex min-h-12 touch-manipulation items-center justify-center gap-1 rounded-control border border-input bg-card px-2 text-center text-base font-medium has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground';
