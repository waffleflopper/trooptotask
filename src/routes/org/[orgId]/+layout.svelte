<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { createOrgContext, setOrgContext } from '$lib/stores/orgContext.svelte';
	import AnnouncementBanner from '$lib/components/AnnouncementBanner.svelte';
	import BannerStack from '$lib/components/BannerStack.svelte';
	import SubscriptionBanner from '$lib/components/SubscriptionBanner.svelte';
	import TopHeader from '$lib/components/TopHeader.svelte';
	import { Button } from '$lib/components/ui/button';
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
		canManageMembers: false
	};

	const readyShell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const suspendedShell = $derived(data.shell.kind === 'suspended' ? data.shell : null);

	// Set OrgContext so child pages can call getOrgContext()
	setOrgContext(
		createOrgContext(() => ({
			orgId: readyShell?.org.id ?? suspendedShell?.org.id ?? '',
			orgUrlSegment: readyShell?.org.urlSegment ?? suspendedShell?.org.urlSegment ?? '',
			orgName: readyShell?.org.name ?? suspendedShell?.org.name ?? '',
			userId: readyShell?.user.id ?? null,
			userRole: readyShell?.member.role ?? 'member',
			capabilityMap: readyShell?.member.capabilityMap,
			scopeSet: readyShell?.member.scopeSet,
			permissions: readyShell?.member.permissions ?? NO_PERMISSIONS,
			scopedGroupId: readyShell?.member.scopedGroupId ?? null,
			isReadOnly: readyShell?.state.isReadOnly ?? suspendedShell?.state.isReadOnly ?? false
		}))
	);

	let showFeedback = $state(false);

	function closeWhatsNew() {
		whatsNewStore.close();
		if (browser && changelog.length > 0 && readyShell?.user.id) {
			localStorage.setItem(`changelog-last-seen-${readyShell.user.id}`, changelog[0].id);
		}
	}

	// Load subscription tier into store (reacts to org navigation changes)
	$effect(() => {
		if (readyShell) {
			subscriptionStore.load(readyShell.state.effectiveTier);
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

{#if suspendedShell}
	<div class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
		<div class="grid max-w-md gap-4 rounded-lg border bg-card p-8 text-center text-card-foreground">
			<h1
				class="[font-family:'Barlow Condensed', sans-serif] text-3xl leading-tight font-bold tracking-[0.04em] text-destructive uppercase"
			>
				Organization Suspended
			</h1>
			<p class="m-0 text-sm leading-relaxed text-muted-foreground">
				This organization ({suspendedShell.org.name}) has been suspended. If you believe this is an error, please
				contact support.
			</p>
			<p class="m-0 font-medium">support@trooptotask.com</p>
			<Button href="/dashboard?show=all" variant="outline">Back to Dashboard</Button>
		</div>
	</div>
{:else if readyShell}
	<BannerStack>
		<SubscriptionBanner orgId={readyShell.org.id} orgUrlSegment={readyShell.org.urlSegment} />
		{#if readyShell.announcements.length}
			<AnnouncementBanner announcements={readyShell.announcements} />
		{/if}
	</BannerStack>

	<TopHeader
		orgId={readyShell.org.id}
		orgUrlSegment={readyShell.org.urlSegment}
		orgName={readyShell.org.name}
		userRole={readyShell.member.role}
		membershipId={readyShell.member.membershipId}
		permissions={readyShell.member.permissions}
		capabilityMap={readyShell.member.capabilityMap}
		onToggleTheme={() => themeStore.toggle()}
		isDarkTheme={themeStore.isDark}
		onFeedback={() => (showFeedback = true)}
		onWhatsNew={() => whatsNewStore.show()}
	>
		{@render children()}
	</TopHeader>

	{#if showFeedback}
		{#await import('$lib/components/FeedbackModal.svelte') then { default: FeedbackModal }}
			<FeedbackModal
				onClose={() => (showFeedback = false)}
				orgId={readyShell.org.id}
				orgName={readyShell.org.name}
				pageUrl={$page.url.pathname}
			/>
		{/await}
	{/if}

	{#if whatsNewStore.open}
		{#await import('$lib/components/WhatsNewModal.svelte') then { default: WhatsNewModal }}
			<WhatsNewModal onClose={closeWhatsNew} />
		{/await}
	{/if}
{/if}
