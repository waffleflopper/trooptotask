<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';

	let { children, data } = $props();

	// Initialize demo mode store with server data
	$effect(() => {
		demoModeStore.load(data.isDemoReadOnly, data.isDemoSandbox);
	});

	// Re-fetch shared data when tab regains focus (handles idle tabs + multi-user changes)
	onMount(() => {
		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				invalidate('app:shared-data');
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	});
</script>

<DemoBanner />

{@render children()}

{#if demoModeStore.showSandboxModal}
	<DemoSandboxModal onClose={() => demoModeStore.closeSandboxModal()} />
{/if}
