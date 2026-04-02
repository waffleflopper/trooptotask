<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { ADMIN_STATUS_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data, form } = $props();
	let activeTab = $state<'new' | 'reviewed' | 'resolved'>('new');
	let expandedId = $state<string | null>(null);
	let savingId = $state<string | null>(null);

	const currentItems = $derived(
		activeTab === 'new' ? data.newItems : activeTab === 'reviewed' ? data.reviewedItems : data.resolvedItems
	);
	const totalCount = $derived(data.newItems.length + data.reviewedItems.length + data.resolvedItems.length);
</script>

<svelte:head>
	<title>Beta Feedback - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell admin-page-shell--compact">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Feedback Queue</p>
			<h1 class="admin-page-title">Beta Feedback</h1>
			<p class="admin-page-subtitle">
				Sort incoming bug reports, feature requests, and tester notes without losing the audit trail.
			</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Total Items</p>
			<p class="admin-overview-card__value">{totalCount}</p>
			<p class="admin-overview-card__meta">Every feedback item currently retained in the platform queue.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">New Items</p>
			<p class="admin-overview-card__value">{data.newItems.length}</p>
			<p class="admin-overview-card__meta">Unread items still waiting on first review.</p>
		</div>
	</div>

	{#if form?.error}
		<div class="admin-alert admin-alert--error">{form.error}</div>
	{/if}

	<div class="admin-segmented" aria-label="Feedback tabs">
		<button class:active={activeTab === 'new'} onclick={() => (activeTab = 'new')}
			>New {#if data.newItems.length > 0}<span>{data.newItems.length}</span>{/if}</button
		>
		<button class:active={activeTab === 'reviewed'} onclick={() => (activeTab = 'reviewed')}
			>Reviewed {#if data.reviewedItems.length > 0}<span>{data.reviewedItems.length}</span>{/if}</button
		>
		<button class:active={activeTab === 'resolved'} onclick={() => (activeTab = 'resolved')}
			>Resolved {#if data.resolvedItems.length > 0}<span>{data.resolvedItems.length}</span>{/if}</button
		>
	</div>

	{#if currentItems.length === 0}
		<div class="admin-panel"><div class="admin-empty">No {activeTab} feedback.</div></div>
	{:else}
		<div class="feedback-stack">
			{#each currentItems as item (item.id)}
				<section class="admin-panel feedback-card">
					<button class="feedback-card__summary" onclick={() => (expandedId = expandedId === item.id ? null : item.id)}>
						<div class="feedback-card__copy">
							<div class="feedback-card__headline">
								<strong>{item.user_email}</strong>
								<Badge
									label={formatAdminLabel(item.category)}
									color={ADMIN_STATUS_COLORS[item.category] ?? 'var(--ink-35)'}
								/>
							</div>
							<p class="feedback-card__preview">
								{item.message.length > 140 ? `${item.message.slice(0, 140)}...` : item.message}
							</p>
							<p class="feedback-card__meta">
								{formatDisplayDateTime(item.created_at)}
								{#if item.organization_name}
									• {item.organization_name}{/if}
								{#if item.page_url}
									• {item.page_url}{/if}
							</p>
						</div>
						<span class="feedback-card__toggle">{expandedId === item.id ? 'Hide' : 'Open'}</span>
					</button>

					{#if expandedId === item.id}
						<div class="feedback-card__detail">
							<div class="feedback-card__section">
								<p class="label">Full Message</p>
								<p class="feedback-card__message">{item.message}</p>
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
								<div class="feedback-card__form">
									<div class="admin-toolbar__field">
										<label class="label" for="status-{item.id}">Status</label>
										<select id="status-{item.id}" name="status" class="select" value={item.status}>
											<option value="new">New</option>
											<option value="reviewed">Reviewed</option>
											<option value="resolved">Resolved</option>
										</select>
									</div>
									<div class="admin-toolbar__field feedback-card__notes">
										<label class="label" for="notes-{item.id}">Admin Notes</label>
										<textarea
											id="notes-{item.id}"
											name="adminNotes"
											class="input feedback-card__textarea"
											rows="4"
											placeholder="Internal notes about this feedback..."
											value={item.admin_notes || ''}
										></textarea>
									</div>
								</div>

								<div class="feedback-card__actions">
									<button type="submit" class="btn btn-primary btn-sm" disabled={savingId !== null}>
										{#if savingId === item.id}<Spinner />{/if}
										Save Notes
									</button>
								</div>
							</form>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feedback-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.feedback-card,
	.feedback-card__detail {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.feedback-card__summary {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
	}

	.feedback-card__copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.feedback-card__headline {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.feedback-card__headline strong {
		font-size: var(--text-base);
	}

	.feedback-card__preview,
	.feedback-card__meta,
	.feedback-card__message {
		margin: 0;
	}

	.feedback-card__preview,
	.feedback-card__message {
		line-height: 1.6;
	}

	.feedback-card__meta,
	.feedback-card__toggle {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.feedback-card__toggle {
		padding-top: 2px;
	}

	.feedback-card__section {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
	}

	.feedback-card__form {
		display: grid;
		grid-template-columns: 180px minmax(0, 1fr);
		gap: var(--sp-3);
	}

	.feedback-card__notes {
		flex: none;
	}

	.feedback-card__textarea {
		min-height: 112px;
		resize: vertical;
	}

	.feedback-card__actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 700px) {
		.feedback-card__form {
			grid-template-columns: 1fr;
		}
	}
</style>
