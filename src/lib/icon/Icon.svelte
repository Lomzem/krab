<script lang="ts" module>
  export type IconName =
    | 'arrow-up'
    | 'back'
    | 'box'
    | 'box-checked'
    | 'centre'
    | 'check'
    | 'close'
    | 'filter'
    | 'forward'
    | 'gear-list'
    | 'map'
    | 'minus'
    | 'net'
    | 'plus'
    | 'pot'
    | 'show-all'
    | 'trips';
</script>

<script lang="ts">
  import type { ClassValue } from 'svelte/elements';

  let {
    name,
    size = 24,
    class: extra
  }: { name: IconName; size?: number; class?: ClassValue } = $props();
</script>

<svg
  class={['block flex-none', extra]}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'arrow-up'}
    <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" />
  {:else if name === 'back'}
    <path d="m15 5-7 7 7 7" />
  {:else if name === 'box' || name === 'box-checked'}
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    {#if name === 'box-checked'}<path d="m7.5 12.5 3 3 6-6.5" />{/if}
  {:else if name === 'centre'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  {:else if name === 'check'}
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6 6 18" />
  {:else if name === 'filter'}
    <path d="M4 6h16M7 12h10M10 18h4" />
  {:else if name === 'forward'}
    <path d="m9 5 7 7-7 7" />
  {:else if name === 'gear-list'}
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.5" cy="6.5" r="1.2" />
    <circle cx="4.5" cy="12" r="1.2" />
    <circle cx="4.5" cy="17.5" r="1.2" />
  {:else if name === 'map'}
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
    <path d="M9 4v14M15 6v14" />
  {:else if name === 'minus'}
    <path d="M5 12h14" />
  {:else if name === 'net'}
    <path d="M12 3 4.2 10.4M12 3l7.8 7.4" />
    <ellipse cx="12" cy="10.4" rx="7.8" ry="2.3" />
    <path d="M4.2 10.4Q5.8 18.4 12 21q6.2-2.6 7.8-10.6" />
    <path d="M7.6 12.5 12 21l4.4-8.5M6.1 15.5h11.8" />
  {:else if name === 'plus'}
    <path d="M5 12h14M12 5v14" />
  {:else if name === 'pot'}
    <path d="M12 9V5.2" />
    <circle cx="12" cy="3.6" r="1.6" />
    <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
    <path d="M3.5 14.7h17M9 9v11.5M15 9v11.5" />
  {:else if name === 'show-all'}
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="9" cy="10" r="1.75" fill="currentColor" />
    <circle cx="15" cy="9" r="1.75" fill="currentColor" />
    <circle cx="12" cy="15" r="1.75" fill="currentColor" />
  {:else}
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4v4h4" />
    <path d="M12 7.5V12l3 2" />
  {/if}
</svg>
