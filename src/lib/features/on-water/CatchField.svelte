<script lang="ts">
  import type { Catch } from '#lib/features/trip/index.js';

  type Count = keyof Catch;

  const COUNTS: readonly [Count, string][] = [
    ['kept', 'Kept'],
    ['released', 'Released']
  ];
  const NOTHING: Catch = { kept: 0, released: 0 };

  let {
    value,
    idPrefix,
    heading = $bindable(),
    onchange
  }: {
    value: Catch | null;
    idPrefix: string;
    heading?: HTMLHeadingElement;
    onchange: (next: Catch | null) => void;
  } = $props();

  const step = (count: Count, by: number) => {
    const from = value ?? NOTHING;
    onchange({ ...from, [count]: Math.max(0, from[count] + by) });
  };

  const stepper =
    'flex size-14 items-center justify-center rounded-control border-2 border-primary text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-muted aria-disabled:border-border aria-disabled:text-muted-foreground';
</script>

<section class="grid gap-3" aria-labelledby="{idPrefix}-catch-title">
  <div class="flex items-center justify-between gap-3">
    <h3
      id="{idPrefix}-catch-title"
      bind:this={heading}
      tabindex="-1"
      class="text-[21px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Catch
    </h3>
    <button
      type="button"
      class="min-h-12 rounded-control border border-input px-4 text-[17px] font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={() => {
        onchange(NOTHING);
      }}>Nothing caught</button
    >
  </div>
  {#each COUNTS as [count, name] (count)}
    {@const shown = value?.[count] ?? null}
    <div
      role="group"
      aria-labelledby="{idPrefix}-{count}"
      class="grid grid-cols-[1fr_auto_4.5rem_auto] items-center gap-2"
    >
      <span id="{idPrefix}-{count}" class="text-[19px] font-semibold"
        >{name}</span
      >
      <button
        type="button"
        class={stepper}
        aria-label="One fewer {count}"
        aria-disabled={shown ? undefined : 'true'}
        onclick={() => {
          if (shown) step(count, -1);
        }}
      >
        <svg
          class="size-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.75"
          stroke-linecap="round"
          aria-hidden="true"><path d="M5 12h14" /></svg
        >
      </button>
      <output
        class="text-center text-[30px] leading-none font-bold tabular-nums"
        aria-live="polite"
      >
        <span aria-hidden="true">{shown ?? '–'}</span>
        <span class="sr-only">{name}: {shown ?? 'not recorded'}</span>
      </output>
      <button
        type="button"
        class={stepper}
        aria-label="One more {count}"
        onclick={() => {
          step(count, 1);
        }}
      >
        <svg
          class="size-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.75"
          stroke-linecap="round"
          aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg
        >
      </button>
    </div>
  {/each}
  {#if value}
    <button
      type="button"
      class="min-h-11 justify-self-start rounded-control px-1 text-[17px] font-semibold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={() => {
        onchange(null);
      }}>Clear catch</button
    >
  {:else}
    <p class="text-[15px] text-muted-foreground">
      Not recorded. Leave it empty if you didn't count.
    </p>
  {/if}
</section>
