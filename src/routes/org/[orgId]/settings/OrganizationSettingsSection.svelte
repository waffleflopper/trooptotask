<script lang="ts">
	import { enhance } from '$app/forms';
	import { isBillingEnabled } from '$lib/config/billing';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { formatCompactDate } from './settingsWorkspaceFormatters';

	let {
		data,
		form,
		loading = $bindable(false),
		memberRoleSummary,
		oldestPendingApproval,
		nextPurgeDate,
		auditEntriesLast30Days,
		planBadge,
		planPrice,
		planCopy,
		billingStatus,
		personnelCount
	} = $props<{
		data: {
			orgId: string;
			orgName: string | null;
			members: unknown[];
			pendingApprovalsCount: number;
			archivedPersonnel: unknown[];
			policies: { retentionMonths: number };
		};
		form: {
			[key: string]: unknown;
			nameSuccess?: boolean;
			error?: string;
		} | null;
		loading?: boolean;
		memberRoleSummary: string;
		oldestPendingApproval: { created_at: string } | null;
		nextPurgeDate: Date | null;
		auditEntriesLast30Days: number;
		planBadge: string;
		planPrice: string;
		planCopy: string;
		billingStatus: string;
		personnelCount: string;
	}>();
</script>

<div class="organization-tab">
	<div class="org-metrics" aria-label="Organization settings summary">
		<div class="org-metric">
			<span>Members</span>
			<strong>{data.members.length}</strong>
			<p>{memberRoleSummary}</p>
		</div>
		<div class="org-metric">
			<span>Pending approvals</span>
			<strong>{data.pendingApprovalsCount}</strong>
			<p>
				{#if oldestPendingApproval}
					Oldest {formatRelativeDate(oldestPendingApproval.created_at)}
				{:else}
					No pending requests
				{/if}
			</p>
		</div>
		<div class="org-metric">
			<span>Archived</span>
			<strong>{data.archivedPersonnel.length}</strong>
			<p>
				{#if nextPurgeDate}
					Next purge {formatCompactDate(nextPurgeDate)}
				{:else}
					Retention {data.policies.retentionMonths} months
				{/if}
			</p>
		</div>
		<div class="org-metric">
			<span>Audit entries</span>
			<strong>{auditEntriesLast30Days}</strong>
			<p>Last 30 days</p>
		</div>
	</div>

	<section class="ledger-section" aria-labelledby="organization-profile-heading">
		<div class="ledger-heading">
			<span>01</span>
			<h3 id="organization-profile-heading">Organization Profile</h3>
			{#if form?.nameSuccess}<p class="state-label state-label--success">Saved</p>{/if}
		</div>
		<form
			method="POST"
			action="?/updateName"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}<div class="error-message error-message--inline">{form.error}</div>{/if}
			<div class="ledger-row">
				<div>
					<label class="field-label" for="name">Organization name</label>
					<p class="field-hint">Displayed across briefs, exports, and printed rosters.</p>
				</div>
				<div class="ledger-control">
					<input id="name" name="name" type="text" class="input" value={data.orgName ?? ''} required />
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update'}
					</button>
				</div>
			</div>
		</form>
		<div class="ledger-row">
			<div>
				<p id="short-code-label" class="field-label">Short code</p>
				<p class="field-hint">Used in URLs and DA-form headers. 3-6 chars.</p>
			</div>
			<div class="ledger-control">
				<div class="coming-soon-field">
					<button
						type="button"
						class="short-code-preview"
						aria-disabled="true"
						aria-labelledby="short-code-label short-code-value"
						aria-describedby="short-code-tooltip"
					>
						<span id="short-code-value">Coming soon</span>
					</button>
					<span id="short-code-tooltip" class="coming-soon-tooltip" role="tooltip">
						Coming soon: future organization slugs for URLs and printed headers.
					</span>
				</div>
			</div>
		</div>
	</section>

	<section class="ledger-section" aria-labelledby="subscription-heading">
		<div class="ledger-heading">
			<span>02</span>
			<h3 id="subscription-heading">Subscription & Billing</h3>
			<p class="state-label">{planBadge} · {planPrice}</p>
		</div>
		<div class="ledger-row">
			<div>
				<p class="field-label">Plan</p>
				<p class="field-hint">{planCopy}</p>
			</div>
			<div class="billing-control">
				<span class="tier-pill">{planBadge}</span>
				<span class="billing-meta">{billingStatus}</span>
				{#if isBillingEnabled}
					<a class="btn btn-primary btn-sm" href={`/org/${data.orgId}/billing`}>Manage Billing</a>
				{/if}
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<p class="field-label">Personnel count</p>
			</div>
			<div class="session-actions">
				<span class="mono-value">{personnelCount}</span>
			</div>
		</div>
	</section>

	<section class="ledger-section" aria-labelledby="session-heading">
		<div class="ledger-heading">
			<span>03</span>
			<h3 id="session-heading">Session</h3>
		</div>
		<div class="ledger-row">
			<div>
				<p class="field-label">Active session</p>
				<p class="field-hint">Sign out of this browser only. Other sessions are unaffected.</p>
			</div>
			<div class="session-actions">
				<a class="btn btn-secondary btn-sm" href="/auth/logout">Sign Out</a>
				<a class="btn btn-secondary btn-sm" href="/dashboard?show=all">Switch Organization</a>
			</div>
		</div>
	</section>
</div>
