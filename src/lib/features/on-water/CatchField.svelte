<script lang="ts">
  import { countOf, type CatchDraft } from './details-draft';
  import SelectedCheck from './SelectedCheck.svelte';

  type Side = keyof CatchDraft;

  const SIDES: readonly [Side, string][] = [
    ['kept', 'Kept'],
    ['released', 'Released']
  ];
  const NOTHING: CatchDraft = { kept: '0', released: '0' };
  const COUNT_FONT_PX = { most: 22, least: 16, digitsFitAtOne: 95 };
  const countFont = (text: string) =>
    Math.max(
      COUNT_FONT_PX.least,
      Math.min(
        COUNT_FONT_PX.most,
        Math.floor(COUNT_FONT_PX.digitsFitAtOne / text.length)
      )
    );

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
    const from = countOf(value?.[side] ?? '') ?? 0;
    set(
      side,
      String(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, from + by)))
    );
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
    if (wrong.length > 1)
      return 'Kept and Released need whole numbers, 0 or more.';
    const [[side, name]] = wrong;
    const blank = value[side].trim() === '';
    return blank &&
      SIDES.every(([each]) => each === side || countOf(value[each]) !== null)
      ? `Enter ${name} too, or leave both empty.`
      : `${name} needs a whole number, 0 or more.`;
  });

  const stepper =
    'flex size-12 shrink-0 touch-manipulation items-center select-none justify-center rounded-control border border-primary text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-muted aria-disabled:border-border aria-disabled:text-muted-foreground';
</script>

<section class="grid gap-3" aria-labelledby="{idPrefix}-catch-title">
  <div class="flex items-center justify-between gap-3">
    <h3
      id="{idPrefix}-catch-title"
      bind:this={heading}
      tabindex="-1"
      class="text-[18px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Catch
    </h3>
    <button
      type="button"
      class={[
        'flex min-h-11 touch-manipulation items-center gap-1 rounded-control border pr-2.5 pl-3 text-[15px] font-medium select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
        nothing
          ? 'border-primary bg-accent text-accent-foreground'
          : 'border-input'
      ]}
      onclick={() => {
        onchange(NOTHING);
      }}>Nothing caught<SelectedCheck shown={nothing} /></button
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
        class="text-[17px] font-medium select-none">{name}</label
      >
      <button
        type="button"
        class={stepper}
        aria-label="One fewer {side}"
        aria-disabled={count ? undefined : 'true'}
        onclick={() => {
          if (count) step(side, -1);
        }}
      >
        <svg
          class="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.25"
          stroke-linecap="round"
          aria-hidden="true"><path d="M5 12h14" /></svg
        >
      </button>
      <input
        id="{idPrefix}-{side}-count"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        value={text ?? ''}
        aria-invalid={wrong.some(([wrongSide]) => wrongSide === side)
          ? 'true'
          : undefined}
        aria-describedby={noteId}
        style:font-size="{countFont(text ?? '')}px"
        class="h-12 w-full min-w-0 rounded-control border border-input bg-card px-1 text-center font-semibold text-foreground tabular-nums focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-2 aria-invalid:border-destructive"
        oninput={(event) => {
          set(side, event.currentTarget.value);
        }}
        onblur={() => {
          leave(side);
        }}
      />
      <button
        type="button"
        class={stepper}
        aria-label="One more {side}"
        aria-disabled={count === Number.MAX_SAFE_INTEGER ? 'true' : undefined}
        onclick={() => {
          if (count !== Number.MAX_SAFE_INTEGER) step(side, 1);
        }}
      >
        <svg
          class="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.25"
          stroke-linecap="round"
          aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg
        >
      </button>
      <output class="sr-only">{name}: {spoken(text)}</output>
    </div>
  {/each}
  <div class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
    <p
      id={noteId}
      class={[
        'text-[15px] leading-5',
        refused
          ? 'border-l-3 border-destructive pl-2 font-medium'
          : 'text-muted-foreground'
      ]}
    >
      {#if refused}
        {guidance}
      {:else if !value}
        Not recorded. Leave both empty if you didn't count.
      {/if}
    </p>
    {#if value}
      <button
        type="button"
        class="min-h-11 touch-manipulation rounded-control px-1 text-[15px] font-medium text-primary underline underline-offset-4 select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onclick={() => {
          left = [];
          onchange(null);
        }}>Clear catch</button
      >
    {/if}
  </div>
</section>
