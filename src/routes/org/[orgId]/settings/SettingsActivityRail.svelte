<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { formatAuditTimestamp, getAuditActionParts, getAuditTone } from './settingsWorkspaceFormatters';

	type ActivityTab = 'approvals' | 'audit';

	type ApprovalRequest = {
		id: string;
		status: string;
		requester_email: string | null;
		resource_description: string | null;
		resource_type: string;
		resource_url: string | null;
		created_at: string;
		denial_reason?: string | null;
	};

	type AuditLog = {
		id: string;
		actor: string | null;
		action: string;
		createdAt: string;
	};

	type AuditLogData = {
		logs: AuditLog[];
		totalCount: number;
	};

	let {
		orgId,
		pendingApprovalsCount,
		approvalRequests,
		auditLog,
		collapsed = $bindable(false)
	}: {
		orgId: string;
		pendingApprovalsCount: number;
		approvalRequests: ApprovalRequest[];
		auditLog: AuditLogData;
		collapsed?: boolean;
	} = $props();

	let activityTab = $state<ActivityTab>('approvals');
	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processingApproval = $state<string | null>(null);

	const pendingApprovals = $derived(approvalRequests.filter((request) => request.status === 'pending'));
	const visibleApprovals = $derived(pendingApprovals.slice(0, 4));
	const visibleAuditLogs = $derived(auditLog.logs.slice(0, 9));

	async function handleApprovalAction(id: string, action: 'approve' | 'deny', reason?: string) {
		if (processingApproval) return;
		processingApproval = id;
		try {
			const res = await fetch(`/org/${orgId}/api/deletion-requests/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action, denialReason: reason ?? null })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Unknown error' }));
				toastStore.error(err.message || 'Failed to process request');
				return;
			}
			denyingId = null;
			denialReason = '';
			await invalidateAll();
		} finally {
			processingApproval = null;
		}
	}
</script>

<aside class="activity-rail" aria-label="Settings activity">
	{#if collapsed}
		<button
			type="button"
			class="activity-rail__restore"
			aria-label="Show activity panel"
			onclick={() => (collapsed = false)}
		>
			Activity
		</button>
	{:else}
		<div class="activity-tabs" role="tablist" aria-label="Settings activity views">
			<button
				type="button"
				role="tab"
				aria-selected={activityTab === 'approvals'}
				class:is-active={activityTab === 'approvals'}
				onclick={() => (activityTab = 'approvals')}
			>
				Approvals <span>{pendingApprovalsCount}</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activityTab === 'audit'}
				class:is-active={activityTab === 'audit'}
				onclick={() => (activityTab = 'audit')}
			>
				Audit Log
			</button>
			<button type="button" class="activity-tabs__collapse" aria-label="Collapse" onclick={() => (collapsed = true)}>
				Hide
			</button>
		</div>
		<div class="activity-rail__body">
			{#if activityTab === 'approvals'}
				<div class="activity-list" aria-label="Pending approval requests">
					{#each visibleApprovals as request (request.id)}
						<article class="approval-item">
							<header>
								<strong>{request.requester_email ?? 'Unknown requester'}</strong>
							</header>
							{#if request.resource_url}
								<a class="approval-item__title" href={request.resource_url}>
									{request.resource_description ?? request.resource_type}
								</a>
							{:else}
								<p class="approval-item__title">{request.resource_description ?? request.resource_type}</p>
							{/if}
							<div class="approval-item__footer">
								<span>{formatRelativeDate(request.created_at)} · Pending</span>
								{#if denyingId === request.id}
									<div class="deny-form deny-form--rail">
										<input
											type="text"
											class="input deny-input"
											placeholder="Reason"
											bind:value={denialReason}
											onkeydown={(event) => {
												if (event.key === 'Enter') handleApprovalAction(request.id, 'deny', denialReason);
												if (event.key === 'Escape') {
													denyingId = null;
													denialReason = '';
												}
											}}
										/>
										<button
											class="btn btn-danger btn-sm"
											disabled={processingApproval === request.id}
											onclick={() => handleApprovalAction(request.id, 'deny', denialReason)}
										>
											{#if processingApproval === request.id}<Spinner />{/if}
											Confirm
										</button>
									</div>
								{:else}
									<div class="approval-item__actions">
										<button
											class="btn btn-primary btn-sm"
											disabled={processingApproval === request.id}
											onclick={() => handleApprovalAction(request.id, 'approve')}
										>
											{#if processingApproval === request.id}<Spinner />{/if}
											Approve
										</button>
										<button class="rail-text-button" onclick={() => (denyingId = request.id)}>Deny</button>
									</div>
								{/if}
							</div>
						</article>
					{/each}
					{#if pendingApprovals.length === 0}
						<p class="activity-empty">No pending requests.</p>
					{:else if pendingApprovals.length <= visibleApprovals.length}
						<p class="activity-empty">No more pending requests.</p>
					{:else}
						<a class="activity-view-all" href={`/org/${orgId}/settings/approvals`}>
							View all {pendingApprovals.length} pending requests
						</a>
					{/if}
				</div>
			{:else}
				<div class="audit-feed" aria-label="Recent audit log entries">
					{#each visibleAuditLogs as log (log.id)}
						{@const actionParts = getAuditActionParts(log.action)}
						<article class="audit-event">
							<time datetime={log.createdAt}>{formatAuditTimestamp(log.createdAt)}</time>
							<div>
								<span class={`audit-event__badge audit-event__badge--${getAuditTone(log.action)}`}>
									{actionParts.area} › {actionParts.event}
								</span>
								<p>{log.actor ?? 'System'}</p>
							</div>
						</article>
					{/each}
					{#if auditLog.totalCount > 0}
						<a class="activity-view-all" href={`/org/${orgId}/settings/audit`}>
							View all {auditLog.totalCount} entries
						</a>
					{:else}
						<p class="activity-empty">No audit log entries yet.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</aside>
