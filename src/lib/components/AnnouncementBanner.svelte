<script lang="ts">
	interface Announcement {
		id: string;
		title: string;
		message: string;
		type: 'info' | 'warning' | 'maintenance';
	}

	let { announcements }: { announcements: Announcement[] } = $props();

	let visibleAnnouncements = $state<Announcement[]>([]);

	$effect(() => {
		visibleAnnouncements = [...announcements];
	});

	async function dismiss(id: string) {
		visibleAnnouncements = visibleAnnouncements.filter((a) => a.id !== id);
		await fetch('/api/announcements/dismiss', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ announcementId: id })
		});
	}

	const typeColors: Record<string, { bg: string; border: string; text: string }> = {
		info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
		warning: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
		maintenance: { bg: '#ffebee', border: '#f44336', text: '#c62828' }
	};
</script>

{#each visibleAnnouncements as announcement (announcement.id)}
	{@const colors = typeColors[announcement.type] ?? typeColors.info}
	<div
		class="announcement-banner"
		style="background: {colors.bg}; border-color: {colors.border}; color: {colors.text};"
		role="alert"
	>
		<div class="announcement-content">
			<strong>{announcement.title}</strong>
			<span>{announcement.message}</span>
		</div>
		<button
			class="announcement-dismiss"
			onclick={() => dismiss(announcement.id)}
			aria-label="Dismiss announcement"
			style="color: {colors.text};"
		>&#x2715;</button>
	</div>
{/each}

<style>
	.announcement-banner {
		display: flex;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		border-left: 4px solid;
		margin-bottom: 1px;
	}

	.announcement-content {
		flex: 1;
		font-size: var(--font-size-sm);
	}

	.announcement-content strong {
		margin-right: var(--spacing-sm);
	}

	.announcement-dismiss {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 16px;
		padding: var(--spacing-xs);
		opacity: 0.7;
	}

	.announcement-dismiss:hover {
		opacity: 1;
	}
</style>
