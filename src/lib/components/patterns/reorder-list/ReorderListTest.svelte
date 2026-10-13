<script lang="ts">
	import { ReorderGrip, ReorderItem, ReorderList } from './index.js';

	let { onmoved }: { onmoved?: (order: string[]) => void } = $props();

	let order = $state(['Orientation', 'Paperwork', 'Training']);
	const entries = $derived(order.map((name) => ({ id: name, label: name })));

	function move(id: string, toIndex: number) {
		const next = order.filter((name) => name !== id);
		next.splice(toIndex, 0, id);
		order = next;
		onmoved?.(next);
	}
</script>

<ReorderList {entries} onmove={move} aria-label="Steps">
	{#each order as name (name)}
		<ReorderItem id={name}>
			<ReorderGrip />
			<span>{name}</span>
		</ReorderItem>
	{/each}
</ReorderList>
