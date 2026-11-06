<script lang="ts">
  import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
  import '@fontsource/atkinson-hyperlegible-next/latin-500.css';
  import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
