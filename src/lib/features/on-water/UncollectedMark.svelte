<script lang="ts">
  let { size = 16 }: { size?: number } = $props();
</script>

<svg
  class="block flex-none"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  aria-hidden="true"
>
  <circle
    cx="8"
    cy="8"
    r="7.25"
    fill="#b3261e"
    stroke="#ffffff"
    stroke-width="1.5"
  />
  <path
    d="M8 4.2v4.6"
    stroke="#ffffff"
    stroke-width="2"
    stroke-linecap="round"
  />
  <circle cx="8" cy="11.6" r="1.15" fill="#ffffff" />
</svg>
