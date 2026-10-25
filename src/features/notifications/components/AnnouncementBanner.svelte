<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { Announcement } from '../contracts';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import AnnouncementBannerRow from './AnnouncementBannerRow.svelte';

	let {
		announcements,
		accountId,
		onCountChange
	}: { accountId: string; announcements: Announcement[]; onCountChange?: (count: number) => void } = $props();

	let visibleAnnouncements = $derived([...announcements]);
	let dismissing = $state<string[]>([]);
	let failedDismissals = $state<string[]>([]);
	let lifetime = 0;
	let currentAccount: string | undefined;
	$effect(() => {
		if (currentAccount !== accountId) {
			currentAccount = accountId;
			++lifetime;
			dismissing = [];
			failedDismissals = [];
		}
	});
	onDestroy(() => {
		++lifetime;
	});
	function isCurrent(account: string, generation: number) {
		return account === accountId && generation === lifetime;
	}

	$effect(() => {
		onCountChange?.(visibleAnnouncements.length);
	});

	async function dismiss(id: string) {
		if (dismissing.includes(id)) return;
		const account = accountId;
		const generation = lifetime;
		dismissing = [...dismissing, id];
		failedDismissals = failedDismissals.filter((failedId) => failedId !== id);
		try {
			const response = await fetch('/api/announcements/dismiss', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ announcementId: id })
			});
			if (!response.ok) throw new Error('Could not dismiss announcement');
			if (!isCurrent(account, generation)) return;
			const index = visibleAnnouncements.findIndex((announcement) => announcement.id === id);
			visibleAnnouncements = visibleAnnouncements.filter((announcement) => announcement.id !== id);
			const next = visibleAnnouncements[Math.min(index, visibleAnnouncements.length - 1)];
			await tick();
			document.getElementById(next ? dismissId(next.id) : 'main-content')?.focus({ preventScroll: !next });
		} catch {
			if (isCurrent(account, generation)) failedDismissals = [...failedDismissals, id];
		} finally {
			if (isCurrent(account, generation)) dismissing = dismissing.filter((pendingId) => pendingId !== id);
		}
	}

	function dismissId(id: string) {
		return `dismiss-announcement-${id}`;
	}

	function dismissErrorId(id: string) {
		return `dismiss-announcement-error-${id}`;
	}
</script>

{#if visibleAnnouncements.length > 0}
	{#each visibleAnnouncements as announcement (announcement.id)}
		{@const failed = failedDismissals.includes(announcement.id)}
		<AnnouncementBannerRow {announcement}>
			{#snippet action()}
				<!-- aria-disabled keeps focus on the pressed button while the dismissal is pending. -->
				<Button
					id={dismissId(announcement.id)}
					type="button"
					variant="ghost"
					size="xs"
					class="shrink-0"
					onclick={() => dismiss(announcement.id)}
					aria-disabled={dismissing.includes(announcement.id) ? 'true' : undefined}
					aria-label={`Dismiss announcement: ${announcement.title}`}
					aria-describedby={failed ? dismissErrorId(announcement.id) : undefined}
				>
					<XIcon aria-hidden="true" class="size-3" />
					Dismiss
				</Button>
			{/snippet}
			{#snippet below()}
				{#if failed}
					<div class="mx-auto w-full max-w-[1680px] px-4 pb-3 sm:px-6">
						<!-- The banner's own alert announces the failure, so this one is not a second live region. -->
						<Alert.Root variant="destructive" role={undefined} id={dismissErrorId(announcement.id)}>
							<Alert.Description>Could not dismiss announcement. Try again.</Alert.Description>
						</Alert.Root>
					</div>
				{/if}
			{/snippet}
		</AnnouncementBannerRow>
	{/each}
{/if}
