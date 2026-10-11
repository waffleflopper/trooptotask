<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
	import { AccountPreferencesProvider } from '$features/identity';
	import { AnnouncementBanner } from '$features/notifications';
	import BannerStack from './BannerStack.svelte';
	import AppShellHeader from './AppShellHeader.svelte';
	import { changelog } from '../changelog';
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
	setAppShellContext(createAppShellContext(() => shell, autoShowWhatsNew));

	function autoShowWhatsNew() {
		if (!browser || hasAutoShownWhatsNew || !changelog.length) return;
		const storage = getBrowserLocalStorage();
		if (!storage) return;
		try {
			if (storage.getItem(`changelog-last-seen-${shell.user.id}`) !== changelog[0].id) {
				hasAutoShownWhatsNew = true;
				showWhatsNew = true;
			}
		} catch {
			/* Storage is optional. Manual opening remains available. */
		}
	}
	function closeWhatsNew() {
		showWhatsNew = false;
		if (!browser || !changelog.length) return;
		try {
			getBrowserLocalStorage()?.setItem(`changelog-last-seen-${shell.user.id}`, changelog[0].id);
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

<BannerStack>
	{#if shell.announcements.length}
		<AnnouncementBanner accountId={shell.user.id} announcements={shell.announcements} />
	{/if}
</BannerStack>
<AppShellHeader
	orgId={shell.org.id}
	orgUrlSegment={shell.org.urlSegment}
	orgName={shell.org.name}
	userId={shell.user.id}
	userRole={shell.member.role}
	membershipId={shell.member.membershipId}
	capabilityMap={shell.member.capabilityMap}
	{onToggleTheme}
	{isDarkTheme}
	onFeedback={() => {
		feedbackPageUrl = $page.url.pathname;
		showFeedback = true;
	}}
	onWhatsNew={() => (showWhatsNew = true)}
>
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
		<WhatsNewModal onClose={closeWhatsNew} />
	{/await}
{/if}
