<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	interface Announcement {
		id: string;
		title: string;
		message: string;
		type: 'info' | 'warning' | 'maintenance';
	}

	let { announcements, onCountChange }: { announcements: Announcement[]; onCountChange?: (count: number) => void } =
		$props();

	let visibleAnnouncements = $derived([...announcements]);

	$effect(() => {
		onCountChange?.(visibleAnnouncements.length);
	});

	async function dismiss(id: string) {
		visibleAnnouncements = visibleAnnouncements.filter((a) => a.id !== id);
		await fetch('/api/announcements/dismiss', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ announcementId: id })
		});
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
					aria-label="Dismiss announcement"
				>
					<XIcon aria-hidden="true" class="size-3" />
					Dismiss
				</Button>
			</div>
		</Alert.Root>
	{/each}
{/if}
