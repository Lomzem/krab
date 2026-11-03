<script lang="ts">
  import type { Tab } from './tabs';

  let { tab }: { tab: Tab } = $props();
</script>

<svg
  class="size-6"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.9"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if tab === 'map'}
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
    <path d="M9 4v14M15 6v14" />
  {:else if tab === 'gear'}
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.5" cy="6.5" r="1.2" />
    <circle cx="4.5" cy="12" r="1.2" />
    <circle cx="4.5" cy="17.5" r="1.2" />
  {:else}
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4v4h4" />
    <path d="M12 7.5V12l3 2" />
  {/if}
</svg>
