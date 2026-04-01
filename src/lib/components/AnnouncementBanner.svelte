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
	{#each visibleAnnouncements as announcement (announcement.id)}
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
		padding: 0;
		box-sizing: border-box;
		border-bottom: 1px solid var(--border-default);
		background: var(--surface-panel);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		max-width: 1680px;
		margin: 0 auto;
		padding: 0.75rem clamp(var(--spacing-md), 2vw, var(--spacing-lg));
	}

	.banner-content::before {
		content: '';
		width: 3px;
		align-self: stretch;
		border-radius: 999px;
		background: var(--info);
		flex-shrink: 0;
	}

	.banner-text {
		flex: 1;
		font-size: var(--text-sm);
		color: var(--text-primary);
		line-height: 1.5;
	}

	.banner-text strong {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.banner-separator {
		margin: 0 var(--spacing-xs);
		color: var(--text-tertiary);
	}

	.dismiss-btn {
		padding: 0;
		background: none;
		border: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
		transition: color var(--transition-fast);
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		color: var(--text-primary);
	}

	.announcement-info {
		background: color-mix(in srgb, var(--info-bg) 55%, var(--surface-panel));
	}

	.announcement-info .banner-content::before {
		background: var(--info);
	}

	.announcement-warning {
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel));
	}

	.announcement-warning .banner-content::before {
		background: var(--amber);
	}

	.announcement-maintenance {
		background: color-mix(in srgb, var(--danger-bg) 72%, var(--surface-panel));
	}

	.announcement-maintenance .banner-content::before {
		background: var(--danger);
	}

	@media (max-width: 640px) {
		.banner-content {
			align-items: flex-start;
			flex-wrap: wrap;
		}

		.dismiss-btn {
			padding-left: calc(3px + var(--spacing-md));
		}
	}
</style>
