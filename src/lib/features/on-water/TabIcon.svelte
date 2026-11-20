<script lang="ts">
  import Icon from '#lib/icon/Icon.svelte';
  import type { Tab } from './tabs';

  let { tab }: { tab: Tab } = $props();

  const NAME = { map: 'map', gear: 'gear-list', trips: 'trips' } as const;
</script>

<Icon name={NAME[tab]} />
