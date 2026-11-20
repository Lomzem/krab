<script lang="ts">
  import Icon from '#lib/icon/Icon.svelte';

  let { shown }: { shown: boolean } = $props();
</script>

<Icon name="check" size={20} class={shown ? undefined : 'invisible'} />
