<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';
	import TopHeader from '$lib/components/TopHeader.svelte';
	import BottomTabBar from '$lib/components/BottomTabBar.svelte';
	import FeedbackModal from '$lib/components/FeedbackModal.svelte';

	let { children, data } = $props();

	let showFeedback = $state(false);

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

{#if !demoModeStore.hasBanner}
	<button class="feedback-pill" onclick={() => (showFeedback = true)} aria-label="Send feedback">
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
		</svg>
		Feedback
	</button>
{/if}

{#if showFeedback}
	<FeedbackModal
		onClose={() => (showFeedback = false)}
		orgId={data.orgId}
		orgName={data.orgName}
		pageUrl={$page.url.pathname}
	/>
{/if}

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

		.feedback-pill {
			bottom: 68px;
		}
	}

	.feedback-pill {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		cursor: pointer;
		z-index: 50;
		transition: all 0.15s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.feedback-pill:hover {
		color: var(--color-text);
		border-color: var(--color-primary);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	}
</style>
