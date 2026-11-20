<script lang="ts">
  import { ACTION_BUTTON } from './controls';
  let { onallow }: { onallow: () => void } = $props();
</script>

<section
  class="flex flex-wrap items-center gap-x-3 gap-y-1"
  aria-labelledby="location-intro-title"
>
  <h2
    id="location-intro-title"
    class="min-w-0 flex-1 basis-32 text-control font-semibold"
  >
    Krab needs location
  </h2>
  <button
    type="button"
    class="min-h-16 grow basis-40 compact:min-h-14 {ACTION_BUTTON}"
    onclick={onallow}>Turn on location</button
  >
</section>
