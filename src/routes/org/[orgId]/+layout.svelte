<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';
	import TopHeader from '$lib/components/TopHeader.svelte';
	import BottomTabBar from '$lib/components/BottomTabBar.svelte';

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

<TopHeader
	orgId={data.orgId}
	orgName={data.orgName}
	userRole={data.userRole}
	permissions={data.permissions}
	allOrgs={data.allOrgs}
	onToggleTheme={() => themeStore.toggle()}
	isDarkTheme={themeStore.isDark}
/>

<main class="app-content" class:has-demo-banner={demoModeStore.hasBanner}>
	{@render children()}
</main>

<BottomTabBar
	orgId={data.orgId}
	permissions={data.permissions}
/>

{#if demoModeStore.showSandboxModal}
	<DemoSandboxModal onClose={() => demoModeStore.closeSandboxModal()} />
{/if}

<style>
	.app-content {
		padding-top: var(--header-height, 56px);
		min-height: 100vh;
	}

	.app-content.has-demo-banner {
		padding-top: calc(var(--header-height, 56px) + 40px);
	}

	@media (max-width: 640px) {
		.app-content {
			padding-bottom: 56px;
		}
	}
</style>
