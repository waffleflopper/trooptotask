<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';
	import DemoBanner from '$lib/components/DemoBanner.svelte';
	import SubscriptionBanner from '$lib/components/SubscriptionBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';
	import TopHeader from '$lib/components/TopHeader.svelte';
	import BottomTabBar from '$lib/components/BottomTabBar.svelte';
	import FeedbackModal from '$lib/components/FeedbackModal.svelte';
	import WhatsNewModal from '$lib/components/WhatsNewModal.svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { changelog } from '$lib/data/changelog';
	import { browser } from '$app/environment';
	import NavigationProgress from '$lib/components/ui/NavigationProgress.svelte';

	let { children, data } = $props();

	let showFeedback = $state(false);
	let announcementCount = $state(0);

	function closeWhatsNew() {
		whatsNewStore.close();
		if (browser && changelog.length > 0 && data.userId) {
			localStorage.setItem(`changelog-last-seen-${data.userId}`, changelog[0].id);
		}
	}

	// Initialize demo mode store with server data
	$effect(() => {
		demoModeStore.load(data.isDemoReadOnly ?? false, data.isDemoSandbox ?? false);
	});

	// Load subscription tier into store (reacts to org navigation changes)
	$effect(() => {
		if (data.effectiveTier) {
			subscriptionStore.load(data.effectiveTier);
		}
	});

	// Re-fetch shared data when the window regains focus (handles idle tabs,
	// switching apps, and multi-user changes). Uses focus/blur instead of
	// visibilitychange so it also catches alt-tabbing between windows.
	// The wasAway guard prevents a spurious re-fetch on initial page load.
	onMount(() => {
		let wasAway = false;
		const handleBlur = () => { wasAway = true; };
		const handleFocus = () => {
			if (wasAway) {
				wasAway = false;
				invalidate('app:shared-data');
			}
		};
		window.addEventListener('blur', handleBlur);
		window.addEventListener('focus', handleFocus);
		return () => {
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('focus', handleFocus);
		};
	});
</script>

{#if data.orgSuspended}
	<div class="suspended-org-container">
		<div class="suspended-org-card">
			<h1>Organization Suspended</h1>
			<p>This organization ({data.orgName}) has been suspended. If you believe this is an error, please contact support.</p>
			<p class="contact">support@trooptotask.com</p>
			<a href="/dashboard?show=all" class="btn btn-secondary">Back to Dashboard</a>
		</div>
	</div>
{:else}
	<NavigationProgress />
	<DemoBanner />
	<SubscriptionBanner orgId={data.orgId} />
	{#if data.activeAnnouncements?.length}
		<AnnouncementBanner announcements={data.activeAnnouncements} onCountChange={(n) => (announcementCount = n)} />
	{/if}

	<TopHeader
		orgId={data.orgId}
		orgName={data.orgName}
		userRole={data.userRole ?? 'member'}
		permissions={data.permissions!}
		allOrgs={data.allOrgs ?? []}
		onToggleTheme={() => themeStore.toggle()}
		isDarkTheme={themeStore.isDark}
		unreadNotificationCount={data.unreadNotificationCount ?? 0}
		onWhatsNew={() => whatsNewStore.show()}
	/>

	<main
		class="app-content"
		class:has-demo-banner={demoModeStore.hasBanner}
		class:has-sub-banner={subscriptionStore.hasBanner}
		style:--announcement-offset="{announcementCount * 40}px"
	>
		{@render children()}
	</main>

	<BottomTabBar
		orgId={data.orgId}
		permissions={data.permissions!}
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

	{#if whatsNewStore.open}
		<WhatsNewModal onClose={closeWhatsNew} />
	{/if}
{/if}

<style>
	.suspended-org-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.suspended-org-card {
		text-align: center;
		max-width: 440px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
	}

	.suspended-org-card h1 {
		color: var(--color-error);
		margin-bottom: var(--spacing-md);
	}

	.suspended-org-card p {
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
	}

	.suspended-org-card .contact {
		font-weight: 600;
		color: var(--color-text);
	}

	.app-content {
		padding-top: calc(var(--header-height, 56px) + var(--announcement-offset, 0px));
		min-height: 100vh;
	}

	.app-content.has-demo-banner {
		padding-top: calc(var(--header-height, 56px) + 40px + var(--announcement-offset, 0px));
	}

	.app-content.has-sub-banner {
		padding-top: calc(var(--header-height, 56px) + 40px + var(--announcement-offset, 0px));
	}

	.app-content.has-demo-banner.has-sub-banner {
		padding-top: calc(var(--header-height, 56px) + 80px + var(--announcement-offset, 0px));
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
