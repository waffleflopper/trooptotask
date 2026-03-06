<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data, form } = $props();
	let activeTab = $state<'new' | 'reviewed' | 'resolved'>('new');
	let expandedId = $state<string | null>(null);
	let savingId = $state<string | null>(null);

	function categoryColor(category: string): string {
		switch (category) {
			case 'bug': return 'var(--color-error)';
			case 'feature': return 'var(--color-info)';
			default: return 'var(--color-text-muted)';
		}
	}

	function categoryLabel(category: string): string {
		switch (category) {
			case 'bug': return 'Bug';
			case 'feature': return 'Feature';
			default: return 'General';
		}
	}

	const currentItems = $derived(
		activeTab === 'new' ? data.newItems
		: activeTab === 'reviewed' ? data.reviewedItems
		: data.resolvedItems
	);

	const totalCount = $derived(data.newItems.length + data.reviewedItems.length + data.resolvedItems.length);
</script>

<svelte:head>
	<title>Beta Feedback - Admin - Troop to Task</title>
</svelte:head>

<div class="feedback-page">
	<header class="page-header">
		<div class="header-row">
			<h1>Beta Feedback</h1>
			{#if totalCount > 0}
				<Badge label="{totalCount} total" color="var(--color-primary)" />
			{/if}
		</div>
		<p class="subtitle">Bug reports, feature requests, and feedback from beta testers</p>
	</header>

	{#if form?.error}
		<div class="alert alert-error">{form.error}</div>
	{/if}

	<div class="tabs">
		<button class="tab" class:active={activeTab === 'new'} onclick={() => (activeTab = 'new')}>
			New
			{#if data.newItems.length > 0}
				<span class="tab-count">{data.newItems.length}</span>
			{/if}
		</button>
		<button class="tab" class:active={activeTab === 'reviewed'} onclick={() => (activeTab = 'reviewed')}>
			Reviewed
			{#if data.reviewedItems.length > 0}
				<span class="tab-count">{data.reviewedItems.length}</span>
			{/if}
		</button>
		<button class="tab" class:active={activeTab === 'resolved'} onclick={() => (activeTab = 'resolved')}>
			Resolved
			{#if data.resolvedItems.length > 0}
				<span class="tab-count">{data.resolvedItems.length}</span>
			{/if}
		</button>
	</div>

	{#if currentItems.length === 0}
		<div class="empty-card">
			<p>No {activeTab} feedback</p>
		</div>
	{:else}
		<div class="feedback-list">
			{#each currentItems as item (item.id)}
				<div class="feedback-card">
					<button class="feedback-summary" onclick={() => (expandedId = expandedId === item.id ? null : item.id)}>
						<div class="feedback-info">
							<div class="feedback-header-row">
								<span class="feedback-email">{item.user_email}</span>
								<Badge label={categoryLabel(item.category)} color={categoryColor(item.category)} />
							</div>
							<div class="feedback-message-preview">
								{item.message.length > 120 ? item.message.slice(0, 120) + '...' : item.message}
							</div>
							<div class="feedback-meta">
								{formatDisplayDateTime(item.created_at)}
								{#if item.organization_name}
									<span class="meta-separator">&middot;</span>
									<span>{item.organization_name}</span>
								{/if}
								{#if item.page_url}
									<span class="meta-separator">&middot;</span>
									<span class="page-url">{item.page_url}</span>
								{/if}
							</div>
						</div>
						<svg class="expand-icon" class:expanded={expandedId === item.id} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="6 9 12 15 18 9"></polyline>
						</svg>
					</button>

					{#if expandedId === item.id}
						<div class="feedback-detail">
							<div class="detail-section">
								<div class="detail-label">Full Message</div>
								<div class="detail-message">{item.message}</div>
							</div>

							<form
								method="POST"
								action="?/update"
								use:enhance={() => {
									savingId = item.id;
									return async ({ update }) => {
										savingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="feedbackId" value={item.id} />

								<div class="detail-row">
									<div class="form-group">
										<label class="label" for="status-{item.id}">Status</label>
										<select id="status-{item.id}" name="status" class="select" value={item.status}>
											<option value="new">New</option>
											<option value="reviewed">Reviewed</option>
											<option value="resolved">Resolved</option>
										</select>
									</div>
								</div>

								<div class="form-group">
									<label class="label" for="notes-{item.id}">Admin Notes</label>
									<textarea
										id="notes-{item.id}"
										name="adminNotes"
										class="input"
										rows="3"
										placeholder="Internal notes about this feedback..."
										value={item.admin_notes || ''}
									></textarea>
								</div>

								<div class="detail-actions">
									<button type="submit" class="btn btn-primary btn-sm" disabled={savingId !== null}>
										{#if savingId === item.id}
											<span class="spinner"></span>
										{/if}
										Save
									</button>
								</div>
							</form>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feedback-page {
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
	}

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-muted);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-count {
		background: var(--color-surface-variant);
		padding: 1px 8px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
	}

	.tab.active .tab-count {
		background: var(--color-primary);
		color: #0F0F0F;
	}

	/* Feedback cards */
	.feedback-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.feedback-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.feedback-summary {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-md);
		padding: var(--spacing-lg);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}

	.feedback-summary:hover {
		background: var(--color-surface-variant);
	}

	.feedback-info {
		flex: 1;
		min-width: 0;
	}

	.feedback-header-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.feedback-email {
		font-weight: 600;
		color: var(--color-text);
		font-size: var(--font-size-base);
	}

	.feedback-message-preview {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		line-height: 1.5;
		margin-bottom: var(--spacing-sm);
	}

	.feedback-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.meta-separator {
		margin: 0 var(--spacing-xs);
	}

	.page-url {
		font-family: monospace;
		font-size: var(--font-size-xs);
	}

	.expand-icon {
		flex-shrink: 0;
		color: var(--color-text-muted);
		transition: transform 0.15s;
		margin-top: 2px;
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
	}

	/* Expanded detail */
	.feedback-detail {
		border-top: 1px solid var(--color-border);
		padding: var(--spacing-lg);
	}

	.detail-section {
		margin-bottom: var(--spacing-lg);
	}

	.detail-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-xs);
	}

	.detail-message {
		background: var(--color-surface-variant);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.detail-row {
		margin-bottom: var(--spacing-md);
	}

	.detail-row .form-group {
		max-width: 200px;
	}

	.detail-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--spacing-md);
	}

	textarea.input {
		resize: vertical;
		min-height: 60px;
		font-family: inherit;
	}

	.spinner {
		display: inline-block;
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 0.8s linear infinite;
		margin-right: 4px;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		text-align: center;
		color: var(--color-text-muted);
	}

	:global([data-theme='dark']) .alert-error {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	@media (max-width: 600px) {
		.feedback-summary {
			padding: var(--spacing-md);
		}

		.feedback-detail {
			padding: var(--spacing-md);
		}
	}
</style>
