<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatPrice, getStatusLabel, getStatusColor } from '$lib/types/subscription';

	let { data, form } = $props();

	let extendTrialDays = $state(7);
	let grantPlanId = $state('pro');
	let grantDuration = $state(30);
	let grantMaxOrgs = $state('');
	let grantMaxPersonnel = $state('');
	let adminNotes = $state(data.user.subscription.adminNotes || '');

	let loading = $state<string | null>(null);

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatShortDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>User Details - Admin - Troop to Task</title>
</svelte:head>

<div class="user-detail-page">
	<header class="page-header">
		<a href="/admin/users" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7"/>
			</svg>
			Back to Users
		</a>
		<h1>User Details</h1>
	</header>

	{#if form?.error}
		<div class="alert error">{form.error}</div>
	{/if}

	{#if form?.success}
		<div class="alert success">Action completed successfully</div>
	{/if}

	<div class="content-grid">
		<!-- User Info -->
		<section class="card">
			<h2>Subscription</h2>
			<div class="info-grid">
				<div class="info-item">
					<span class="label">User ID</span>
					<code class="value">{data.user.id}</code>
				</div>
				<div class="info-item">
					<span class="label">Plan</span>
					<span class="value plan-badge" class:free={data.user.subscription.planId === 'free'} class:pro={data.user.subscription.planId === 'pro'} class:team={data.user.subscription.planId === 'team'}>
						{data.user.subscription.planName}
					</span>
				</div>
				<div class="info-item">
					<span class="label">Status</span>
					<span class="value status-badge" style="--status-color: {getStatusColor(data.user.subscription.status)}">
						{getStatusLabel(data.user.subscription.status)}
					</span>
				</div>
				<div class="info-item">
					<span class="label">Billing Cycle</span>
					<span class="value">{data.user.subscription.billingCycle}</span>
				</div>
				<div class="info-item">
					<span class="label">Member Since</span>
					<span class="value">{formatShortDate(data.user.subscription.createdAt)}</span>
				</div>
				{#if data.user.subscription.currentPeriodEnd}
					<div class="info-item">
						<span class="label">Current Period Ends</span>
						<span class="value">{formatShortDate(data.user.subscription.currentPeriodEnd)}</span>
					</div>
				{/if}
				{#if data.user.subscription.trialEnd}
					<div class="info-item">
						<span class="label">Trial Ends</span>
						<span class="value">{formatShortDate(data.user.subscription.trialEnd)}</span>
					</div>
				{/if}
				{#if data.user.subscription.stripeCustomerId}
					<div class="info-item">
						<span class="label">Stripe Customer</span>
						<code class="value">{data.user.subscription.stripeCustomerId}</code>
					</div>
				{/if}
			</div>

			{#if data.user.subscription.overrideExpiry}
				<div class="override-info">
					<strong>Active Override:</strong>
					{#if data.user.subscription.overrideMaxOrgs}
						Max Orgs: {data.user.subscription.overrideMaxOrgs}
					{/if}
					{#if data.user.subscription.overrideMaxPersonnel}
						Max Personnel: {data.user.subscription.overrideMaxPersonnel}
					{/if}
					<span class="expires">Expires: {formatShortDate(data.user.subscription.overrideExpiry)}</span>
				</div>
			{/if}
		</section>

		<!-- Organizations -->
		<section class="card">
			<h2>Organizations ({data.organizations.length})</h2>
			{#if data.organizations.length > 0}
				<ul class="org-list">
					{#each data.organizations as org (org.id)}
						<li class="org-item">
							<span class="org-name">{org.name}</span>
							<span class="org-role">{org.role}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-state">No organizations</p>
			{/if}
		</section>

		<!-- Admin Actions -->
		<section class="card actions-card">
			<h2>Admin Actions</h2>

			<!-- Extend Trial -->
			<div class="action-section">
				<h3>Extend Trial</h3>
				<form
					method="POST"
					action="?/extendTrial"
					use:enhance={() => {
						loading = 'extendTrial';
						return async ({ update }) => {
							loading = null;
							await update();
						};
					}}
				>
					<div class="action-row">
						<input
							type="number"
							name="days"
							bind:value={extendTrialDays}
							min="1"
							max="365"
							class="input-sm"
						/>
						<span class="input-suffix">days</span>
						<button type="submit" class="btn btn-secondary" disabled={loading === 'extendTrial'}>
							{loading === 'extendTrial' ? 'Extending...' : 'Extend'}
						</button>
					</div>
				</form>
			</div>

			<!-- Grant Subscription -->
			<div class="action-section">
				<h3>Grant Subscription</h3>
				<form
					method="POST"
					action="?/grantSubscription"
					use:enhance={() => {
						loading = 'grantSubscription';
						return async ({ update }) => {
							loading = null;
							await update();
						};
					}}
				>
					<div class="form-grid">
						<div class="form-group">
							<label for="planId">Plan</label>
							<select id="planId" name="planId" bind:value={grantPlanId}>
								{#each data.allPlans as plan (plan.id)}
									<option value={plan.id}>{plan.name}</option>
								{/each}
							</select>
						</div>
						<div class="form-group">
							<label for="durationDays">Duration (days)</label>
							<input type="number" id="durationDays" name="durationDays" bind:value={grantDuration} min="1" />
						</div>
						<div class="form-group">
							<label for="maxOrgs">Max Orgs Override</label>
							<input type="number" id="maxOrgs" name="maxOrgs" bind:value={grantMaxOrgs} placeholder="Leave empty for plan default" />
						</div>
						<div class="form-group">
							<label for="maxPersonnel">Max Personnel Override</label>
							<input type="number" id="maxPersonnel" name="maxPersonnel" bind:value={grantMaxPersonnel} placeholder="Leave empty for plan default" />
						</div>
					</div>
					<button type="submit" class="btn btn-primary" disabled={loading === 'grantSubscription'}>
						{loading === 'grantSubscription' ? 'Granting...' : 'Grant Subscription'}
					</button>
				</form>
			</div>

			<!-- Admin Notes -->
			<div class="action-section">
				<h3>Admin Notes</h3>
				<form
					method="POST"
					action="?/updateNotes"
					use:enhance={() => {
						loading = 'updateNotes';
						return async ({ update }) => {
							loading = null;
							await update();
						};
					}}
				>
					<textarea
						name="notes"
						bind:value={adminNotes}
						rows="4"
						placeholder="Internal notes about this user..."
					></textarea>
					<button type="submit" class="btn btn-secondary" disabled={loading === 'updateNotes'}>
						{loading === 'updateNotes' ? 'Saving...' : 'Save Notes'}
					</button>
				</form>
			</div>
		</section>

		<!-- Payment History -->
		<section class="card">
			<h2>Payment History</h2>
			{#if data.payments.length > 0}
				<div class="payments-table">
					<table>
						<thead>
							<tr>
								<th>Date</th>
								<th>Amount</th>
								<th>Status</th>
								<th>Description</th>
							</tr>
						</thead>
						<tbody>
							{#each data.payments as payment (payment.id)}
								<tr>
									<td>{formatShortDate(payment.createdAt)}</td>
									<td>{formatPrice(payment.amount)}</td>
									<td>
										<span class="payment-status" class:succeeded={payment.status === 'succeeded'} class:failed={payment.status === 'failed'}>
											{payment.status}
										</span>
									</td>
									<td>{payment.description || '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty-state">No payment history</p>
			{/if}
		</section>

		<!-- Audit Log -->
		<section class="card">
			<h2>Admin Activity</h2>
			{#if data.auditLog.length > 0}
				<ul class="audit-list">
					{#each data.auditLog as log (log.id)}
						<li class="audit-item">
							<span class="audit-action">{log.action.replace('_', ' ')}</span>
							{#if log.details}
								<code class="audit-details">{JSON.stringify(log.details)}</code>
							{/if}
							<span class="audit-time">{formatDate(log.createdAt)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-state">No admin activity for this user</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.user-detail-page {
		max-width: 1000px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.alert {
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-lg);
	}

	.alert.error {
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		color: var(--color-error);
		border: 1px solid var(--color-error);
	}

	.alert.success {
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		color: var(--color-success);
		border: 1px solid var(--color-success);
	}

	.content-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	/* Info Grid */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-md);
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-item .label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-item .value {
		font-weight: 500;
		color: var(--color-text);
	}

	.info-item code {
		font-size: var(--font-size-sm);
		background: var(--color-surface-variant);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.plan-badge {
		display: inline-block;
		font-size: var(--font-size-sm);
		padding: 2px 10px;
		border-radius: var(--radius-full);
	}

	.plan-badge.free {
		background: var(--color-surface-variant);
		color: var(--color-text-muted);
	}

	.plan-badge.pro {
		background: color-mix(in srgb, var(--color-primary) 15%, transparent);
		color: var(--color-primary);
	}

	.plan-badge.team {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}

	.status-badge {
		display: inline-block;
		font-size: var(--font-size-sm);
		padding: 2px 10px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--status-color) 15%, transparent);
		color: var(--status-color);
	}

	.override-info {
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: color-mix(in srgb, var(--color-warning) 10%, transparent);
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}

	.override-info .expires {
		color: var(--color-text-muted);
		margin-left: var(--spacing-sm);
	}

	/* Org List */
	.org-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.org-item {
		display: flex;
		justify-content: space-between;
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.org-item:last-child {
		border-bottom: none;
	}

	.org-name {
		font-weight: 500;
	}

	.org-role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	/* Actions Card */
	.actions-card {
		background: var(--color-surface-variant);
	}

	.action-section {
		padding: var(--spacing-md);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.action-section:last-child {
		margin-bottom: 0;
	}

	.action-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.action-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.input-sm {
		width: 80px;
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
	}

	.input-suffix {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-group label {
		font-size: var(--font-size-xs);
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.form-group input,
	.form-group select {
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
	}

	textarea {
		width: 100%;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: inherit;
		resize: vertical;
		margin-bottom: var(--spacing-sm);
	}

	.btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-secondary {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-border);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Payments Table */
	.payments-table {
		overflow-x: auto;
	}

	.payments-table table {
		width: 100%;
		border-collapse: collapse;
	}

	.payments-table th,
	.payments-table td {
		padding: var(--spacing-sm);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
	}

	.payments-table th {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.payment-status {
		font-size: var(--font-size-xs);
		padding: 2px 6px;
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}

	.payment-status.succeeded {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}

	.payment-status.failed {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
	}

	/* Audit List */
	.audit-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.audit-item {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
	}

	.audit-item:last-child {
		border-bottom: none;
	}

	.audit-action {
		font-weight: 500;
		text-transform: capitalize;
	}

	.audit-details {
		display: block;
		font-size: var(--font-size-xs);
		background: var(--color-surface-variant);
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		margin: var(--spacing-xs) 0;
	}

	.audit-time {
		display: block;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}
</style>
