<script lang="ts">
  import { Command as CommandPrimitive } from 'bits-ui';
  import SelectedCheck from '../SelectedCheck.svelte';

  let {
    ref = $bindable(null),
    checked = false,
    class: className,
    children,
    ...restProps
  }: CommandPrimitive.ItemProps & { checked?: boolean } = $props();
</script>

<CommandPrimitive.Item
  bind:ref
  data-slot="command-item"
  class={[
    'flex min-h-12 cursor-pointer touch-manipulation items-center justify-between gap-2 rounded-control px-3 text-base break-words select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-accent data-selected:text-accent-foreground',
    className
  ]}
  {...restProps}
>
  <span class="min-w-0">{@render children?.()}</span>
  <SelectedCheck shown={checked} />
</CommandPrimitive.Item>
