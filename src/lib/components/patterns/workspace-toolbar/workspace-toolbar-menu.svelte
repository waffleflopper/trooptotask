<script lang="ts">
	import { onDestroy, tick, type Snippet } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	type Props = {
		label: string;
		trigger: Snippet<[Record<string, unknown>]>;
		children: Snippet<[(action: () => void) => void]>;
	};

	let { label, trigger, children }: Props = $props();

	// A closing menu keeps its pointer handlers through the exit animation and pulls focus back into
	// itself, so a chosen action runs once this menu has closed, or once it unmounts mid-close.
	let pending: (() => void) | null = null;

	// The first choice wins; a second item clicked during the exit animation is ignored.
	function choose(action: () => void): void {
		pending ??= action;
	}

	async function runPending(): Promise<void> {
		const action = pending;
		if (!action) return;
		pending = null;
		await tick();
		action();
	}

	function handleOpenChangeComplete(open: boolean): void {
		if (!open) void runPending();
	}

	onDestroy(() => void runPending());
</script>

<DropdownMenu.Root onOpenChangeComplete={handleOpenChangeComplete}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger(props)}
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>{label}</DropdownMenu.Label>
		{@render children(choose)}
	</DropdownMenu.Content>
</DropdownMenu.Root>
