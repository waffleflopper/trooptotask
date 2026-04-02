<script lang="ts">
	import SubNav from './SubNav.svelte';

	interface Props {
		tabs: { label: string; value: string; badge?: number }[];
		active: string;
		onChange: (value: string) => void;
	}

	let { tabs, active, onChange }: Props = $props();
</script>

<SubNav {tabs} {active} {onChange} />
