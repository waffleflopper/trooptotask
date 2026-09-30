<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Announcement } from '../contracts';
	import XIcon from '@lucide/svelte/icons/x';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { toastStore } from '$lib/stores/toast.svelte';

	let {
		announcements,
		accountId,
		onCountChange
	}: { accountId: string; announcements: Announcement[]; onCountChange?: (count: number) => void } = $props();

	let visibleAnnouncements = $derived([...announcements]);
	let dismissing = $state<string[]>([]);
	let lifetime = 0;
	let currentAccount: string | undefined;
	$effect(() => {
		if (currentAccount !== accountId) {
			currentAccount = accountId;
			++lifetime;
			dismissing = [];
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
		try {
			const response = await fetch('/api/announcements/dismiss', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ announcementId: id })
			});
			if (!response.ok) throw new Error('Could not dismiss announcement');
			if (!isCurrent(account, generation)) return;
			visibleAnnouncements = visibleAnnouncements.filter((announcement) => announcement.id !== id);
		} catch {
			if (isCurrent(account, generation)) toastStore.error('Could not dismiss announcement. Try again.');
		} finally {
			if (isCurrent(account, generation)) dismissing = dismissing.filter((pendingId) => pendingId !== id);
		}
	}

	function variantFor(type: Announcement['type']) {
		return type === 'maintenance' ? 'destructive' : type;
	}
</script>

{#if visibleAnnouncements.length > 0}
	{#each visibleAnnouncements as announcement (announcement.id)}
		<Alert.Root variant={variantFor(announcement.type)} class="rounded-none border-x-0 border-t-0 px-0 py-0">
			<div
				class="mx-auto flex w-full max-w-[1680px] flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-6"
			>
				<span class="mt-1 h-auto w-0.5 self-stretch rounded-full bg-current opacity-70 sm:mt-0"></span>
				<div class="min-w-0 flex-1 text-sm leading-6">
					<Alert.Title class="inline font-mono text-xs font-semibold tracking-wide uppercase">
						{announcement.title}
					</Alert.Title>
					<span class="mx-1 text-muted-foreground">-</span>
					<Alert.Description class="inline text-sm text-current">
						{announcement.message}
					</Alert.Description>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="xs"
					class="shrink-0"
					onclick={() => dismiss(announcement.id)}
					disabled={dismissing.includes(announcement.id)}
					aria-label="Dismiss announcement"
				>
					<XIcon aria-hidden="true" class="size-3" />
					Dismiss
				</Button>
			</div>
		</Alert.Root>
	{/each}
{/if}
