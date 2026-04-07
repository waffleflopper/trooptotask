<script lang="ts">
	interface TabItem {
		label: string;
		value: string;
		badge?: number;
	}

	interface Props {
		tabs: TabItem[];
		active?: string;
		onChange?: (value: string) => void;
	}

	let { tabs = [], active, onChange }: Props = $props();
</script>

<nav aria-label="Sub navigation">
	{#each tabs as tab (tab.value)}
		<button type="button" aria-pressed={active === tab.value} onclick={() => onChange?.(tab.value)}>
			<span>{tab.label}</span>
			{#if tab.badge !== undefined}
				<span data-testid={`tab-badge-${tab.value}`}>{tab.badge}</span>
			{/if}
		</button>
	{/each}
</nav>
