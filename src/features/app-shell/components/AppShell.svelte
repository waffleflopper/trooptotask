<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
	import { endOrganizationLifetime } from '$lib/stores/core';
	import AccountPreferencesProvider from '$features/identity/AccountPreferencesProvider.svelte';
	import { AnnouncementBanner } from '$features/notifications';
	import BannerStack from './BannerStack.svelte';
	import AppShellHeader from './AppShellHeader.svelte';
	import { createAppShellContext, setAppShellContext } from '../appShellContext';
	import type { ReadyAppShell } from '../contracts';

	let {
		shell,
		children,
		feedback,
		onToggleTheme,
		isDarkTheme
	}: {
		shell: ReadyAppShell;
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		children: Snippet;
		feedback: Snippet<[{ onClose: () => void; orgId: string; orgName: string; pageUrl: string }]>;
	} = $props();
	let showFeedback = $state(false);
	let feedbackPageUrl = $state('');
	let showWhatsNew = $state(false);
	let hasAutoShownWhatsNew = false;
	const newestWhatsNewId = $derived(shell.whatsNew[0]?.id);
	let header = $state<AppShellHeader>();
	setAppShellContext(
		createAppShellContext(() => shell, {
			autoShowWhatsNew,
			refreshNotifications: () => header?.refreshNotifications()
		})
	);
	// The Organization layout keys this shell by user, Organization and session; its teardown ends that lifetime.
	$effect(() => endOrganizationLifetime);

	function autoShowWhatsNew() {
		if (!browser || hasAutoShownWhatsNew || !newestWhatsNewId) return;
		const storage = getBrowserLocalStorage();
		if (!storage) return;
		try {
			if (storage.getItem(`changelog-last-seen-${shell.user.id}`) !== newestWhatsNewId) {
				hasAutoShownWhatsNew = true;
				showWhatsNew = true;
			}
		} catch {
			/* Storage is optional. Manual opening remains available. */
		}
	}
	function openWhatsNew() {
		showWhatsNew = true;
	}
	function openFeedback() {
		feedbackPageUrl = $page.url.pathname;
		showFeedback = true;
	}
	function closeWhatsNew() {
		showWhatsNew = false;
		if (!browser || !newestWhatsNewId) return;
		try {
			getBrowserLocalStorage()?.setItem(`changelog-last-seen-${shell.user.id}`, newestWhatsNewId);
		} catch {
			/* Closing the dialog does not depend on persistent browser storage. */
		}
	}
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

<AppShellHeader
	bind:this={header}
	orgId={shell.org.id}
	orgUrlSegment={shell.org.urlSegment}
	orgName={shell.org.name}
	userId={shell.user.id}
	userRole={shell.member.role}
	membershipId={shell.member.membershipId}
	capabilityMap={shell.member.capabilityMap}
	disabledFeatures={shell.org.disabledFeatures}
	account={shell.user}
	{onToggleTheme}
	{isDarkTheme}
	onFeedback={openFeedback}
	onWhatsNew={openWhatsNew}
>
	{#snippet banner()}
		<BannerStack>
			{#if shell.announcements.length}
				<AnnouncementBanner accountId={shell.user.id} announcements={shell.announcements} />
			{/if}
		</BannerStack>
	{/snippet}
	<AccountPreferencesProvider userId={shell.user.id} orgId={shell.org.id} preferences={shell.preferences}>
		{@render children()}
	</AccountPreferencesProvider>
</AppShellHeader>
{#if showFeedback}
	{@render feedback({
		onClose: () => (showFeedback = false),
		orgId: shell.org.id,
		orgName: shell.org.name,
		pageUrl: feedbackPageUrl
	})}
{/if}
{#if showWhatsNew}
	{#await import('./WhatsNewModal.svelte') then { default: WhatsNewModal }}
		<WhatsNewModal
			entries={shell.whatsNew}
			allEntriesHref={`/org/${shell.org.urlSegment}/whats-new`}
			onClose={closeWhatsNew}
		/>
	{/await}
{/if}
