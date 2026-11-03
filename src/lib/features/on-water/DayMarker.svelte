<script lang="ts">
  let {
    day,
    size = 22,
    class: tone = 'fill-card text-foreground'
  }: { day: number; size?: number; class?: string } = $props();

  const SHAPES = ['circle', 'square', 'diamond', 'hexagon'] as const;
  const shape = $derived(SHAPES[(day - 1) % SHAPES.length]);
</script>

<svg
  class="block flex-none overflow-visible {tone}"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
>
  <g stroke="currentColor" stroke-width="2">
    {#if shape === 'circle'}
      <circle cx="12" cy="12" r="10.5" />
    {:else if shape === 'square'}
      <rect x="2" y="2" width="20" height="20" rx="2" />
    {:else if shape === 'diamond'}
      <path d="M12 0.5 23.5 12 12 23.5 0.5 12Z" />
    {:else}
      <path d="M6.5 2h11l5.5 10-5.5 10h-11L1 12Z" />
    {/if}
  </g>
  <text
    x="12"
    y="12.5"
    fill="currentColor"
    stroke="none"
    text-anchor="middle"
    dominant-baseline="middle"
    font-size={day > 9 ? 10 : 13}
    font-weight="700">{day}</text
  >
</svg>
