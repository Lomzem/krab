<script lang="ts">
  import { roughness, type Availability } from '#lib/features/trip/index.js';

  let { status }: { status: Availability } = $props();

  let guidanceOpen = $state(false);

  const rough = $derived(status.kind === 'ready' && roughness(status.fix));
</script>

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
      </div>
      <button
        type="button"
        class="-mr-2 min-h-11 rounded-control px-2 text-left text-[15px] font-medium text-primary underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-expanded={guidanceOpen}
        aria-controls="location-off-steps"
        onclick={() => {
          guidanceOpen = !guidanceOpen;
        }}>{guidanceOpen ? 'Hide steps' : 'Show steps'}</button
      >
    </div>
    {#if guidanceOpen}
      <ol id="location-off-steps" class="pt-1 pb-1 text-[15px] leading-snug">
        <li>Settings › Privacy &amp; Security › Location Services</li>
        <li>Location Services on</li>
        <li>Safari Websites › While Using</li>
        <li>Reopen Krab</li>
      </ol>
    {/if}
  </section>
{:else}
  <p
    class={[
      'flex items-center gap-2 border-t border-border bg-card px-4 pt-2 text-[15px] font-medium',
      status.kind === 'finding' ? 'text-muted-foreground' : 'text-foreground'
    ]}
  >
    {#if status.kind === 'finding' || rough}
      <span
        class={[
          'size-2 shrink-0 rounded-full border-2',
          status.kind === 'finding'
            ? 'border-muted-foreground'
            : 'border-action bg-action'
        ]}
        aria-hidden="true"
      ></span>
    {/if}
    <span class="min-h-lh">
      {#if status.kind === 'finding'}
        Finding position
      {:else if rough}
        Rough position, within about <span aria-hidden="true"
          >{rough.short}</span
        ><span class="sr-only">{rough.spoken}</span>
      {/if}
    </span>
  </p>
{/if}
