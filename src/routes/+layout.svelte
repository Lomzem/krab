<script lang="ts">
  import '@fontsource/barlow/latin-400.css';
  import '@fontsource/barlow/latin-500.css';
  import '@fontsource/barlow/latin-600.css';
  import '@fontsource/barlow/latin-700.css';
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
