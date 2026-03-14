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
</script>

{#if visibleAnnouncements.length > 0}
	<div class="announcement-container">
		{#each visibleAnnouncements as announcement (announcement.id)}
			<div
				class="announcement-banner announcement-{announcement.type}"
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
				>&#x2715;</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.announcement-container {
		position: fixed;
		top: 60px;
		right: var(--spacing-lg);
		left: var(--spacing-lg);
		max-width: 600px;
		margin-left: auto;
		z-index: 150;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		pointer-events: none;
	}

	.announcement-banner {
		display: flex;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		border-left: 4px solid;
		border-radius: var(--radius-lg);
		gap: var(--spacing-md);
		pointer-events: auto;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.announcement-content {
		flex: 1;
		font-size: var(--font-size-sm);
		line-height: 1.4;
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
		opacity: 0.6;
		flex-shrink: 0;
	}

	.announcement-dismiss:hover {
		opacity: 1;
	}

	/* Info */
	.announcement-info {
		background: #e3f2fd;
		border-color: #2196f3;
		color: #1565c0;
	}

	.announcement-info .announcement-dismiss { color: #1565c0; }

	:global([data-theme='dark']) .announcement-info {
		background: #1a2332;
		border-color: #2196f3;
		color: #90caf9;
	}

	:global([data-theme='dark']) .announcement-info .announcement-dismiss { color: #90caf9; }

	/* Warning */
	.announcement-warning {
		background: #fff3e0;
		border-color: #ff9800;
		color: #e65100;
	}

	.announcement-warning .announcement-dismiss { color: #e65100; }

	:global([data-theme='dark']) .announcement-warning {
		background: #2a1f0d;
		border-color: #ff9800;
		color: #ffcc80;
	}

	:global([data-theme='dark']) .announcement-warning .announcement-dismiss { color: #ffcc80; }

	/* Maintenance */
	.announcement-maintenance {
		background: #ffebee;
		border-color: #f44336;
		color: #c62828;
	}

	.announcement-maintenance .announcement-dismiss { color: #c62828; }

	:global([data-theme='dark']) .announcement-maintenance {
		background: #2a1215;
		border-color: #f44336;
		color: #ef9a9a;
	}

	:global([data-theme='dark']) .announcement-maintenance .announcement-dismiss { color: #ef9a9a; }

	:global([data-theme='dark']) .announcement-banner {
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}

	@media (max-width: 768px) {
		.announcement-container {
			right: var(--spacing-sm);
			left: var(--spacing-sm);
		}
	}
</style>
