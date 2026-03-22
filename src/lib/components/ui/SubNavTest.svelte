<script lang="ts">
	import SubNav from './SubNav.svelte';

	interface Props {
		tabs: { label: string; value: string; badge?: number }[];
		active: string;
		onChange: (value: string) => void;
		variant?: 'underline' | 'pill';
	}

	let { tabs, active, onChange, variant }: Props = $props();
</script>

<SubNav {tabs} {active} {onChange} {variant} />
