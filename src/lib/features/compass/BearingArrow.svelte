<script lang="ts">
  import Icon from '#lib/shared/Icon.svelte';
  let { degrees }: { degrees: number } = $props();

  let turned = 0;
  const rotation = $derived.by(() => {
    const step = ((((Math.round(degrees) - turned) % 360) + 540) % 360) - 180;
    turned += step;
    return turned;
  });
</script>

<span
  class="block size-6 flex-none motion-safe:transition-transform"
  style:transform={`rotate(${String(rotation)}deg)`}
>
  <Icon name="arrow-up" />
</span>
