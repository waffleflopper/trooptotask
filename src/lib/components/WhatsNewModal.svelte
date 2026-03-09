<script lang="ts">
	import Modal from './Modal.svelte';
	import { changelog } from '$lib/data/changelog';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { onClose }: { onClose: () => void } = $props();

	const latest = changelog[0];
	const older = changelog.slice(1, 10);
</script>

<Modal title="What's New" {onClose} width="520px" titleId="whats-new-title">
	<div class="whats-new-content">
		{#if latest}
			<div class="latest-entry">
				<div class="entry-header">
					<h3 class="entry-title">{latest.title}</h3>
					<span class="entry-date">{formatDisplayDate(latest.date)}</span>
				</div>
				<ul class="entry-items">
					{#each latest.items as item}
						<li>{item}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if older.length > 0}
			<div class="older-section">
				<div class="older-divider">
					<span class="older-label">Earlier Updates</span>
				</div>
				{#each older as entry (entry.id)}
					<div class="older-entry">
						<div class="entry-header">
							<h4 class="older-title">{entry.title}</h4>
							<span class="entry-date">{formatDisplayDate(entry.date)}</span>
						</div>
						<ul class="entry-items entry-items--compact">
							{#each entry.items as item}
								<li>{item}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-primary" onclick={onClose}>Got it</button>
	{/snippet}
</Modal>

<style>
	.whats-new-content {
		max-height: 60vh;
		overflow-y: auto;
	}

	.latest-entry {
		margin-bottom: var(--spacing-md);
	}

	.entry-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.entry-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.entry-date {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.entry-items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.entry-items li {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		padding-left: var(--spacing-md);
		position: relative;
	}

	.entry-items li::before {
		content: '•';
		position: absolute;
		left: 0;
		color: var(--color-primary);
		font-weight: 700;
	}

	/* Older section */
	.older-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.older-divider {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
	}

	.older-divider::before,
	.older-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-divider);
	}

	.older-label {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.older-entry {
		padding: var(--spacing-sm) 0;
	}

	.older-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.entry-items--compact li {
		font-size: var(--font-size-xs);
		line-height: 1.5;
	}
</style>
