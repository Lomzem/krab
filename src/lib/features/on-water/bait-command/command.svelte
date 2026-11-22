<script lang="ts">
  import { Command as CommandPrimitive } from 'bits-ui';

  let {
    ref = $bindable(null),
    value = $bindable(''),
    class: className,
    children,
    ...restProps
  }: CommandPrimitive.RootProps = $props();

  const NATIVE_KEYS = new Set(['Home', 'End']);

  const fromSearch = (event: KeyboardEvent) =>
    event.target instanceof HTMLInputElement && !NATIVE_KEYS.has(event.key);
</script>

<CommandPrimitive.Root bind:value bind:ref {...restProps}>
  {#snippet child({ props })}
    {@const handle = props.onkeydown as (event: KeyboardEvent) => void}
    <div
      {...props}
      data-slot="command"
      class={['flex flex-col', className]}
      role="group"
      onkeydown={(event) => {
        if (fromSearch(event)) handle(event);
      }}
    >
      {@render children?.()}
    </div>
  {/snippet}
</CommandPrimitive.Root>
