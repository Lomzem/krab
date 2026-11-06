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
  let guidanceOpen = $state(false);

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
    class="border-t border-l-3 border-border border-l-destructive bg-card px-4 py-1.5"
    aria-labelledby="location-off-title"
  >
    <div class="flex flex-wrap items-center gap-x-3">
      <div class="min-w-0 flex-1 basis-40">
        <h2
          id="location-off-title"
          class="text-[16px] leading-snug font-semibold"
        >
          Location is off
        </h2>
        <p class="text-[14px] leading-snug text-muted-foreground">
          Drops save without a position.
        </p>
      </div>
      <button
        type="button"
        class="-mr-2 min-h-11 rounded-control px-2 text-left text-[15px] font-medium text-primary underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-expanded={guidanceOpen}
        aria-controls="location-off-steps"
        onclick={() => {
          guidanceOpen = !guidanceOpen;
        }}>{guidanceOpen ? 'Hide steps' : 'How to turn on in Settings'}</button
      >
    </div>
    {#if guidanceOpen}
      <p id="location-off-steps" class="pt-1 pb-1 text-[15px] leading-snug">
        Open Settings, then Privacy &amp; Security, then Location Services. Make
        sure Location Services is on and Safari Websites is set to While Using
        the App. Then reopen Krab.
      </p>
    {/if}
  </section>
{:else}
  <p
    class={[
      'flex items-center gap-2 border-t border-border bg-card px-4 pt-2 text-[15px] font-medium',
      status.kind === 'finding' ? 'text-muted-foreground' : 'text-foreground'
    ]}
  >
    <span
      class={[
        'size-2 shrink-0 rounded-full border-2',
        status.kind === 'finding'
          ? 'border-muted-foreground'
          : 'border-action bg-action'
      ]}
      aria-hidden="true"
    ></span>
    <span>
      {#if status.kind === 'finding'}
        Finding your position
      {:else if rough}
        Rough position, within about <span aria-hidden="true"
          >{rough.short}</span
        ><span class="sr-only">{rough.spoken}</span>
      {:else}
        Position ready
      {/if}
    </span>
  </p>
{/if}
