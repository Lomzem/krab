<script lang="ts">
  import { FOCUS } from './controls';
  let heading = $state<HTMLHeadingElement>();

  $effect(() => {
    heading?.focus();
  });
</script>

<section
  class="grid gap-3 border-t border-border bg-card p-4"
  aria-labelledby="saving-drop-title"
  aria-busy="true"
>
  <div class="flex items-center gap-3">
    <span
      class="size-4.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
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
  </div>
</section>
