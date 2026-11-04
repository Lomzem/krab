<script lang="ts">
  let { onallow }: { onallow: () => void } = $props();
</script>

<section
  class="grid gap-3 border-t border-border bg-card p-4"
  aria-labelledby="location-intro-title"
>
  <h2 id="location-intro-title" class="text-[21px] font-bold">
    Krab needs your location
  </h2>
  <p class="text-[17px]">
    Each time you drop a pot or a net, Krab saves where it went so you can find
    it again. Your locations stay on this phone. Your phone will ask next.
  </p>
  <button
    type="button"
    class="min-h-14 w-full rounded-control bg-primary text-[19px] font-bold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
    onclick={onallow}>Turn on location</button
  >
</section>
