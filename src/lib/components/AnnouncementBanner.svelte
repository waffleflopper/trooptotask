<script lang="ts">
	interface Announcement {
		id: string;
		title: string;
		message: string;
		type: 'info' | 'warning' | 'maintenance';
	}

	let { announcements, onCountChange }: { announcements: Announcement[]; onCountChange?: (count: number) => void } =
		$props();

	let visibleAnnouncements = $state<Announcement[]>([]);

	$effect(() => {
		visibleAnnouncements = [...announcements];
	});

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
</script>

{#if visibleAnnouncements.length > 0}
	{#each visibleAnnouncements as announcement, i (announcement.id)}
		<div class="announcement-banner announcement-{announcement.type}" role="alert">
			<div class="banner-content">
				<span class="banner-text">
					<strong>{announcement.title}</strong>
					<span class="banner-separator">—</span>
					{announcement.message}
				</span>
				<button class="dismiss-btn" onclick={() => dismiss(announcement.id)} aria-label="Dismiss announcement"
					>Dismiss</button
				>
			</div>
		</div>
	{/each}
{/if}

<style>
	.announcement-banner {
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-lg);
		box-sizing: border-box;
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		max-width: 1200px;
		margin: 0 auto;
	}

	.banner-text {
		flex: 1;
		font-size: var(--font-size-sm);
	}

	.banner-separator {
		margin: 0 var(--spacing-xs);
		opacity: 0.7;
	}

	.dismiss-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: var(--radius-sm);
		color: inherit;
		font-size: var(--font-size-xs);
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dismiss-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Info */
	.announcement-info {
		background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
		color: white;
	}

	/* Warning */
	.announcement-warning {
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: white;
	}

	/* Maintenance */
	.announcement-maintenance {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		color: white;
	}
</style>
