<script lang="ts">
  import { Command as CommandPrimitive } from 'bits-ui';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: CommandPrimitive.ListProps = $props();
</script>

<CommandPrimitive.List
  bind:ref
  data-slot="command-list"
  class={['overflow-x-hidden overflow-y-auto overscroll-contain', className]}
  {...restProps}
>
  <CommandPrimitive.Viewport>
    {@render children?.()}
  </CommandPrimitive.Viewport>
</CommandPrimitive.List>
