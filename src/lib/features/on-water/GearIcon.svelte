<script lang="ts">
  import Icon from '#lib/icon/Icon.svelte';
  import type { Kind } from '#lib/features/trip/index.js';

  let { kind, size = 24 }: { kind: Kind; size?: number } = $props();
</script>

<Icon name={kind} {size} />
