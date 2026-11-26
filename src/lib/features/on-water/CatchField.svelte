<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { Input } from '@ui-sdk/svelte/input';
  import Icon from '#lib/shared/Icon.svelte';
  import { FOCUS, PRESS } from '#lib/shared/control-states.js';
  import { countOf, type CatchDraft } from './details-draft';
  import SelectedCheck from './SelectedCheck.svelte';

  type Side = keyof CatchDraft;

  const SIDES: readonly [Side, string][] = [
    ['kept', 'Kept'],
    ['released', 'Released']
  ];
  const NOTHING: CatchDraft = { kept: '0', released: '0' };
  const ARROW_STEPS: Partial<Record<string, number>> = {
    ArrowUp: 1,
    ArrowDown: -1
  };
  const modified = (event: KeyboardEvent) =>
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  const countSize = (text: string) => {
    if (text.length <= 4) return 'text-title';
    return text.length === 5 ? 'text-control' : 'text-base';
  };

  let {
    value,
    idPrefix,
    invalid,
    heading = $bindable(),
    onchange
  }: {
    value: CatchDraft | null;
    idPrefix: string;
    invalid: boolean;
    heading?: HTMLHeadingElement;
    onchange: (next: CatchDraft | null) => void;
  } = $props();

  let left = $state<Side[]>([]);

  const set = (side: Side, text: string) => {
    if (countOf(text) !== null) left = left.filter((other) => other !== side);
    const next = { ...(value ?? NOTHING), [side]: text };
    const empty = SIDES.every(([each]) => next[each].trim() === '');
    if (empty) left = [];
    onchange(empty ? null : next);
  };

  const leave = (side: Side) => {
    if (value && countOf(value[side]) === null && !left.includes(side))
      left = [...left, side];
  };

  const step = (side: Side, by: number) => {
    const text = value?.[side] ?? '';
    const from = countOf(text);
    if (from === null && text.trim() !== '') {
      leave(side);
      return;
    }
    const next = (from ?? 0) + by;
    if (next >= 0 && next <= Number.MAX_SAFE_INTEGER) set(side, String(next));
  };

  const spoken = (text: string | undefined) => {
    if (text === undefined) return 'not recorded';
    const count = countOf(text);
    if (count !== null) return String(count);
    return text.trim() === '' ? 'empty' : 'not a whole number';
  };

  const noteId = $derived(`${idPrefix}-catch-note`);
  const nothing = $derived(
    value !== null && SIDES.every(([side]) => countOf(value[side]) === 0)
  );
  const wrong = $derived(
    value === null
      ? []
      : SIDES.filter(
          ([side]) =>
            countOf(value[side]) === null && (invalid || left.includes(side))
        )
  );
  const refused = $derived(wrong.length > 0);
  const guidance = $derived.by(() => {
    if (value === null || wrong.length === 0) return '';
    if (wrong.length > 1) return 'Whole numbers only';
    const [[side, name]] = wrong;
    const blank = value[side].trim() === '';
    return blank &&
      SIDES.every(([each]) => each === side || countOf(value[each]) !== null)
      ? `Enter ${name} too`
      : `Whole number for ${name}`;
  });

  const stepper = `flex size-12 shrink-0 touch-manipulation items-center select-none justify-center rounded-control border border-primary text-primary ${FOCUS} ${PRESS} active:bg-muted aria-disabled:border-border aria-disabled:text-muted-foreground`;
</script>

<section class="grid gap-3" aria-labelledby="{idPrefix}-catch-title">
  <div class="flex items-center justify-between gap-3">
    <h3
      id="{idPrefix}-catch-title"
      bind:this={heading}
      tabindex="-1"
      class="text-control font-semibold {FOCUS}"
    >
      Catch
    </h3>
    <Button
      aria-pressed={nothing}
      class={[
        `flex min-h-11 touch-manipulation items-center gap-1 rounded-control border pr-2.5 pl-3 text-sm font-medium select-none ${FOCUS}`,
        nothing
          ? 'border-primary bg-accent text-accent-foreground'
          : 'border-input'
      ]}
      onclick={() => {
        onchange(NOTHING);
      }}>Nothing caught<SelectedCheck shown={nothing} /></Button
    >
  </div>
  {#each SIDES as [side, name] (side)}
    {@const text = value?.[side]}
    {@const count = countOf(text ?? '')}
    <div
      role="group"
      aria-labelledby="{idPrefix}-{side}"
      class="grid touch-manipulation grid-cols-[minmax(0,1fr)_auto_4.5rem_auto] items-center gap-2"
    >
      <label
        id="{idPrefix}-{side}"
        for="{idPrefix}-{side}-count"
        class="text-control font-medium select-none">{name}</label
      >
      <Button
        class={stepper}
        aria-label="One fewer {side}"
        aria-disabled={count === 0 || (text ?? '').trim() === ''
          ? 'true'
          : undefined}
        onclick={() => {
          step(side, -1);
        }}
      >
        <Icon name="minus" />
      </Button>
      <Input
        id="{idPrefix}-{side}-count"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        value={text ?? ''}
        aria-invalid={wrong.some(([wrongSide]) => wrongSide === side)
          ? 'true'
          : undefined}
        aria-describedby={noteId}
        class="h-12 w-full min-w-0 rounded-control border border-input bg-card px-1 text-center {countSize(
          text ?? ''
        )} font-semibold text-foreground tabular-nums {FOCUS} aria-invalid:border-2 aria-invalid:border-destructive"
        onValueChange={(next) => {
          set(side, next);
        }}
        onkeydown={(event) => {
          const by = ARROW_STEPS[event.key];
          if (by === undefined || modified(event)) return;
          event.preventDefault();
          step(side, by);
        }}
        onblur={() => {
          leave(side);
        }}
      />
      <Button
        class={stepper}
        aria-label="One more {side}"
        aria-disabled={count === Number.MAX_SAFE_INTEGER ? 'true' : undefined}
        onclick={() => {
          step(side, 1);
        }}
      >
        <Icon name="plus" />
      </Button>
      <output class="sr-only">{name}: {spoken(text)}</output>
    </div>
  {/each}
  <div class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    <p
      id={noteId}
      class={[
        'text-sm leading-5',
        refused
          ? 'border-l-3 border-destructive pl-2 font-medium'
          : 'text-muted-foreground'
      ]}
    >
      {#if refused}
        {guidance}
      {/if}
    </p>
    {#if value}
      <Button
        class="min-h-11 touch-manipulation rounded-control px-1 text-sm font-medium text-primary underline underline-offset-4 select-none {FOCUS}"
        onclick={() => {
          left = [];
          onchange(null);
        }}>Clear catch</Button
      >
    {/if}
  </div>
</section>
