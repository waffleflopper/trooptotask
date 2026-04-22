<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { createOrgContext, setOrgContext } from '$lib/stores/orgContext.svelte';
	import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';
	import BannerStack from '$lib/components/BannerStack.svelte';
	import SubscriptionBanner from '$lib/components/SubscriptionBanner.svelte';
	import DemoSandboxModal from '$lib/components/DemoSandboxModal.svelte';
	import TopHeader from '$lib/components/TopHeader.svelte';
	import BottomTabBar from '$lib/components/BottomTabBar.svelte';
	import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
	import { changelog } from '$lib/data/changelog';
	import { browser } from '$app/environment';
	import type { OrganizationMemberPermissions } from '$lib/types';

	let { children, data } = $props();

	const NO_PERMISSIONS: OrganizationMemberPermissions = {
		canViewCalendar: false,
		canEditCalendar: false,
		canViewPersonnel: false,
		canEditPersonnel: false,
		canViewTraining: false,
		canEditTraining: false,
		canViewCriticalTasks: false,
		canEditCriticalTasks: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canViewLeadersBook: false,
		canEditLeadersBook: false,
		canManageMembers: false
	};

	// Set OrgContext so child pages can call getOrgContext()
	setOrgContext(
		createOrgContext(() => ({
			orgId: data.orgId ?? '',
			orgName: data.orgName ?? '',
			userId: data.userId ?? null,
			userRole: data.userRole ?? 'member',
			permissions: data.permissions ?? NO_PERMISSIONS,
			scopedGroupId: data.scopedGroupId ?? null,
			isReadOnly: data.effectiveTier?.isReadOnly ?? false
		}))
	);

	let showFeedback = $state(false);

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

	const FOCUS_REFRESH_AWAY_MS = 60_000;
	const FOCUS_REFRESH_COOLDOWN_MS = 90_000;

	// Re-fetch shared data only after a meaningful absence. This still catches
	// idle tabs and cross-user changes, but avoids refreshing every time someone
	// alt-tabs to Excel or email for a few seconds.
	onMount(() => {
		let blurredAt = 0;
		let lastRefreshAt = Date.now();
		let debounceTimer: ReturnType<typeof setTimeout>;

		const handleBlur = () => {
			blurredAt = Date.now();
			clearTimeout(debounceTimer);
		};

		const handleFocus = () => {
			if (!blurredAt) return;

			const now = Date.now();
			const awayMs = now - blurredAt;
			blurredAt = 0;

			if (awayMs < FOCUS_REFRESH_AWAY_MS) return;
			if (now - lastRefreshAt < FOCUS_REFRESH_COOLDOWN_MS) return;

			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				lastRefreshAt = Date.now();
				void invalidate('app:org-core');
			}, 750);
		};

		window.addEventListener('blur', handleBlur);
		window.addEventListener('focus', handleFocus);
		return () => {
			clearTimeout(debounceTimer);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('focus', handleFocus);
		};
	});
</script>

{#if data.orgSuspended}
	<div class="suspended-org-container">
		<div class="suspended-org-card">
			<h1>Organization Suspended</h1>
			<p>
				This organization ({data.orgName}) has been suspended. If you believe this is an error, please contact support.
			</p>
			<p class="contact">support@trooptotask.com</p>
			<a href="/dashboard?show=all" class="btn btn-secondary">Back to Dashboard</a>
		</div>
	</div>
{:else}
	<BannerStack>
		{#if demoModeStore.hasBanner}
			{#await import('$lib/components/DemoBanner.svelte') then { default: DemoBanner }}
				<DemoBanner />
			{/await}
		{/if}
		<SubscriptionBanner orgId={data.orgId} />
		{#if data.activeAnnouncements?.length}
			<AnnouncementBanner announcements={data.activeAnnouncements} />
		{/if}
	</BannerStack>

	<TopHeader
		orgId={data.orgId}
		orgName={data.orgName}
		userRole={data.userRole ?? 'member'}
		permissions={data.permissions!}
		allOrgs={data.allOrgs ?? []}
		onToggleTheme={() => themeStore.toggle()}
		isDarkTheme={themeStore.isDark}
		unreadNotificationCount={data.unreadNotificationCount ?? 0}
		onFeedback={!demoModeStore.hasBanner ? () => (showFeedback = true) : undefined}
		onWhatsNew={() => whatsNewStore.show()}
	/>

	<main id="main-content" class="app-content">
		{@render children()}
	</main>

	<BottomTabBar orgId={data.orgId} permissions={data.permissions!} />

	{#if showFeedback}
		{#await import('$lib/components/FeedbackModal.svelte') then { default: FeedbackModal }}
			<FeedbackModal
				onClose={() => (showFeedback = false)}
				orgId={data.orgId}
				orgName={data.orgName}
				pageUrl={$page.url.pathname}
			/>
		{/await}
	{/if}

	{#if demoModeStore.showSandboxModal}
		<DemoSandboxModal onClose={() => demoModeStore.closeSandboxModal()} />
	{/if}

	{#if whatsNewStore.open}
		{#await import('$lib/components/WhatsNewModal.svelte') then { default: WhatsNewModal }}
			<WhatsNewModal onClose={closeWhatsNew} />
		{/await}
	{/if}
{/if}

<style>
	.suspended-org-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--surface-page);
		padding: var(--sp-6);
	}

	.suspended-org-card {
		text-align: center;
		max-width: 440px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--sp-8);
	}

	.suspended-org-card h1 {
		color: var(--danger);
		margin-bottom: var(--sp-4);
	}

	.suspended-org-card p {
		color: var(--text-secondary);
		margin-bottom: var(--sp-4);
	}

	.suspended-org-card .contact {
		font-weight: 600;
		color: var(--text-primary);
	}

	.app-content {
		padding-top: calc(var(--header-height, 56px) + var(--banner-height, 0px));
		min-height: 100vh;
		background:
			linear-gradient(to bottom, rgba(14, 14, 13, 0.03), rgba(14, 14, 13, 0)) 0 0 / 100% 7rem no-repeat,
			var(--surface-page);
	}

	@media (max-width: 920px) {
		.app-content {
			padding-bottom: calc(64px + env(safe-area-inset-bottom));
		}
	}
</style>
