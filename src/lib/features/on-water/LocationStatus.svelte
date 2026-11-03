<script lang="ts">
  import type { LocationPermission } from '#lib/features/location/index.js';
  import {
    availability,
    roughness,
    type Fix
  } from '#lib/features/trip/index.js';

  let { permission, fix }: { permission: LocationPermission; fix: Fix | null } =
    $props();

  let checkedAt = $state(Date.now());

  const status = $derived(
    availability({ denied: permission === 'denied', fix }, checkedAt)
  );

  const rough = $derived(status.kind === 'ready' && roughness(status.fix));

  const recheck = () => {
    checkedAt = Date.now();
  };

  $effect(() => {
    if (status.kind !== 'ready') return;
    const timer = setTimeout(recheck, status.staleAt - Date.now());
    return () => {
      clearTimeout(timer);
    };
  });
</script>

<svelte:document onvisibilitychange={recheck} />

{#if status.kind === 'denied'}
  <section
    class="grid gap-2 border-t border-l-4 border-border border-l-destructive bg-card px-4 py-3"
    aria-labelledby="location-off-title"
  >
    <h2 id="location-off-title" class="text-[19px] font-bold">
      Location is off
    </h2>
    <p class="text-[17px]">
      You can still drop gear, but it is saved without a position.
    </p>
    <p class="text-[17px] text-muted-foreground">
      To turn location back on, open Settings, then Privacy &amp; Security, then
      Location Services. Make sure Location Services is on and Safari Websites
      is set to While Using the App. Then reopen Krab.
    </p>
  </section>
{:else}
  <p class="border-t border-border bg-card px-4 pt-3 text-[17px] font-semibold">
    {#if status.kind === 'finding'}
      Finding your position
    {:else if rough}
      Rough position, within about <span aria-hidden="true">{rough.short}</span
      ><span class="sr-only">{rough.spoken}</span>
    {:else}
      Position ready
    {/if}
  </p>
{/if}
