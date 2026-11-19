<script lang="ts">
  import { ACTION_BUTTON } from './controls';
  let { onallow }: { onallow: () => void } = $props();
</script>

<section
  class="grid gap-3 border-t border-border bg-card p-4"
  aria-labelledby="location-intro-title"
>
  <h2 id="location-intro-title" class="text-[18px] font-semibold">
    Krab needs location
  </h2>
  <button type="button" class="w-full {ACTION_BUTTON}" onclick={onallow}
    >Turn on location</button
  >
</section>
