<script lang="ts">
  import { Badge } from '#lib/components/ui/badge/index.js';
</script>

<svelte:head>
  <title>Krab</title>
  <meta name="description" content="A foundation for keeping track of crab gear." />
</svelte:head>

<main class="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
  <div class="space-y-4 text-center">
    <h1 class="text-3xl font-semibold tracking-tight">Krab</h1>
    <Badge variant="secondary">Scaffold</Badge>
    <p class="text-sm text-muted-foreground">A foundation for keeping track of crab gear.</p>
  </div>
</main>
