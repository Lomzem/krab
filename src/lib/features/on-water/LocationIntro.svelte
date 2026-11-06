<script lang="ts">
  import { ACTION_BUTTON } from './controls';
  let { onallow }: { onallow: () => void } = $props();
</script>

<section
  class="grid gap-3 border-t border-border bg-card p-4"
  aria-labelledby="location-intro-title"
>
  <h2 id="location-intro-title" class="text-[18px] font-semibold">
    Krab needs your location
  </h2>
  <p class="text-[16px] leading-normal">
    Each time you drop a pot or a net, Krab saves where it went so you can find
    it again. Your locations stay on this phone. Your phone will ask next.
  </p>
  <button type="button" class="w-full {ACTION_BUTTON}" onclick={onallow}
    >Turn on location</button
  >
</section>
