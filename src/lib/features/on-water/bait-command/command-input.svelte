<script lang="ts">
  import { Command as CommandPrimitive } from 'bits-ui';
  import { FOCUS } from '../controls';

  let {
    ref = $bindable(null),
    value = $bindable(''),
    controls,
    class: className,
    ...restProps
  }: CommandPrimitive.InputProps & { controls: string | null } = $props();
</script>

<CommandPrimitive.Input {value} {...restProps}>
  {#snippet child({ props })}
    <input
      {...props}
      bind:value
      bind:this={ref}
      data-slot="command-input"
      class={[
        'min-h-12 w-full rounded-control border border-input bg-card px-3 text-base text-foreground aria-invalid:border-2 aria-invalid:border-destructive',
        FOCUS,
        className
      ]}
      role={controls ? 'combobox' : undefined}
      aria-autocomplete={controls ? 'list' : undefined}
      aria-expanded={controls ? 'true' : undefined}
      aria-controls={controls ?? undefined}
      aria-activedescendant={controls
        ? (props['aria-activedescendant'] as string | undefined)
        : undefined}
    />
  {/snippet}
</CommandPrimitive.Input>
