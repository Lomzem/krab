<script lang="ts">
  import type { Day } from '#lib/features/trip/index.js';

  let {
    day,
    size = 22,
    class: tone = ''
  }: { day: Day; size?: number; class?: string } = $props();

  const SHAPES = ['circle', 'square', 'diamond', 'hexagon'] as const;
  const shape = $derived(SHAPES[(day.number - 1) % SHAPES.length]);
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap {tone}">
  <svg
    class="block flex-none overflow-visible"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <g fill="none" stroke="currentColor" stroke-width="2.5">
      {#if shape === 'circle'}
        <circle cx="12" cy="12" r="10" />
      {:else if shape === 'square'}
        <rect x="2.5" y="2.5" width="19" height="19" rx="2" />
      {:else if shape === 'diamond'}
        <path d="M12 1 23 12 12 23 1 12Z" />
      {:else}
        <path d="M6.75 2.5h10.5L22.5 12l-5.25 9.5H6.75L1.5 12Z" />
      {/if}
    </g>
  </svg>{day.text}
</span>
