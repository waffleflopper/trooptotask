<script lang="ts">
	import { ReorderGrip, ReorderItem, ReorderList } from './index.js';

	let { onmoved, nested = false }: { onmoved?: (order: string[]) => void; nested?: boolean } = $props();

	let order = $state(['Orientation', 'Paperwork', 'Training']);
	const entries = $derived(order.map((name) => ({ id: name, label: name })));

	const subEntries = [
		{ id: 'N1', label: 'Sub one' },
		{ id: 'N2', label: 'Sub two' }
	];

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
			<button type="button">{name}</button>
			<input aria-label="{name} note" />
			{#if nested && name === 'Orientation'}
				<ReorderList entries={subEntries} onmove={() => {}} aria-label="Sub steps">
					{#each subEntries as sub (sub.id)}
						<ReorderItem id={sub.id}>
							<ReorderGrip />
							<span>{sub.label}</span>
						</ReorderItem>
					{/each}
				</ReorderList>
			{/if}
		</ReorderItem>
	{/each}
</ReorderList>
