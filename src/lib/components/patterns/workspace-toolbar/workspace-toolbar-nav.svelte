<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import type { WorkspaceToolbarNavItem } from './types.js';

	type Props = {
		ariaLabel: string;
		items: WorkspaceToolbarNavItem[];
	};

	let { ariaLabel, items }: Props = $props();
</script>

<nav aria-label={ariaLabel}>
	<ButtonGroup.Root>
		{#each items as item (item.href)}
			<Button variant="outline" href={item.href}>{item.label}</Button>
		{/each}
	</ButtonGroup.Root>
</nav>
