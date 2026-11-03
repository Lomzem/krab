<script lang="ts">
  let { degrees }: { degrees: number } = $props();
</script>

<svg
  class="block size-6 flex-none motion-safe:transition-transform"
  style:transform={`rotate(${String(Math.round(degrees))}deg)`}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.25"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" />
</svg>
