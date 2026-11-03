<script lang="ts">
  import type { Kind } from '#lib/features/trip/index.js';

  let { kind, size = 24 }: { kind: Kind; size?: number } = $props();
</script>

<svg
  class="block flex-none"
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
  {#if kind === 'pot'}
    <path d="M12 9V5.2" />
    <circle cx="12" cy="3.6" r="1.6" />
    <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
    <path d="M3.5 14.7h17M9 9v11.5M15 9v11.5" />
  {:else}
    <path d="M12 3 4.2 10.4M12 3l7.8 7.4" />
    <ellipse cx="12" cy="10.4" rx="7.8" ry="2.3" />
    <path d="M4.2 10.4Q5.8 18.4 12 21q6.2-2.6 7.8-10.6" />
    <path d="M7.6 12.5 12 21l4.4-8.5M6.1 15.5h11.8" />
  {/if}
</svg>
