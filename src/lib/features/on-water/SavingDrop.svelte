<script lang="ts">
  import { FOCUS } from '#lib/shared/control-states.js';
  let heading = $state<HTMLHeadingElement>();

  $effect(() => {
    heading?.focus();
  });
</script>

<section
  class="flex min-h-16 items-center justify-center gap-2 rounded-control bg-muted compact:min-h-14"
  aria-labelledby="saving-drop-title"
  aria-busy="true"
>
  <span
    class="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
    aria-hidden="true"
  ></span>
  <h2
    id="saving-drop-title"
    bind:this={heading}
    tabindex="-1"
    class="text-control font-semibold {FOCUS}"
  >
    Saving drop
  </h2>
</section>
