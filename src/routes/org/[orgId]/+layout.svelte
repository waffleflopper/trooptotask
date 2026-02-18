<script lang="ts">
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';

	let { children, data } = $props();

	// Initialize demo mode store with server data
	$effect(() => {
		demoModeStore.load(data.isDemoReadOnly, data.isDemoSandbox);
	});
</script>

<DemoBanner />

{@render children()}

{#if demoModeStore.showSandboxModal}
	<DemoSandboxModal onClose={() => demoModeStore.closeSandboxModal()} />
{/if}
