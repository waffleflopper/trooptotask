<script lang="ts">
	import * as Tooltip from './index.js';

	let { customContent = false }: { customContent?: boolean } = $props();
	let contentRef = $state<HTMLDivElement | null>(null);
	let escapeEvents = $state(0);
</script>

<Tooltip.Provider>
	<Tooltip.Root>
		<Tooltip.Trigger>First help</Tooltip.Trigger>
		<Tooltip.Content>First details</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>Second help</Tooltip.Trigger>
		{#if customContent}
			<Tooltip.Content id="caller-help" bind:ref={contentRef} onEscapeKeydown={() => escapeEvents++}>
				{#snippet child({ props, wrapperProps })}
					<div {...wrapperProps}>
						<div {...props}>Second details</div>
					</div>
				{/snippet}
			</Tooltip.Content>
		{:else}
			<Tooltip.Content>Second details</Tooltip.Content>
		{/if}
	</Tooltip.Root>
</Tooltip.Provider>

<output aria-label="Content reference">{contentRef?.id ?? ''}</output>
<output aria-label="Escape events">{escapeEvents}</output>
