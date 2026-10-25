<script lang="ts">
	import { AnnouncementBannerRow } from '$features/notifications';
	import { Button } from '$lib/components/ui/button';
	import XIcon from '@lucide/svelte/icons/x';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let {
		title,
		message,
		type,
		expiresAt
	}: { title: string; message: string; type: 'info' | 'warning' | 'maintenance'; expiresAt: string | null } = $props();

	const announcement = $derived({
		id: 'preview',
		title: title.trim() || 'Banner title',
		message: message.trim() || 'Banner message appears here, exactly as people will read it.',
		type
	});
</script>

<figure class="m-0 grid gap-2" aria-label="Banner preview">
	<div class="overflow-hidden rounded-md border" data-testid="banner-preview">
		<AnnouncementBannerRow {announcement} preview>
			{#snippet action()}
				<Button type="button" variant="ghost" size="xs" class="shrink-0" tabindex={-1} aria-hidden="true">
					<XIcon aria-hidden="true" class="size-3" />
					Dismiss
				</Button>
			{/snippet}
		</AnnouncementBannerRow>
	</div>
	<figcaption class="text-xs text-muted-foreground">
		{expiresAt ? `Shown until ${formatDisplayDateTime(expiresAt)}.` : 'Shown until you turn it off.'}
	</figcaption>
</figure>
