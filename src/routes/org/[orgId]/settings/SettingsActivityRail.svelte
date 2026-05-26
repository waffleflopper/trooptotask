<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';
	import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';
	import { formatAuditTimestamp, getAuditActionParts } from './settingsWorkspaceFormatters';

	type ActivityTab = 'approvals' | 'audit';

	type Activity = OrganizationSettingsWorkspace['sections']['dataExport']['activity'];
	type AuditLogEntry = Activity['auditLog']['logs'][number];

	let {
		orgId,
		activity,
		collapsed = $bindable(false),
		lockedTab = null
	}: {
		orgId: string;
		activity: Activity;
		collapsed?: boolean;
		lockedTab?: ActivityTab | null;
	} = $props();

	let activityTab = $state<ActivityTab>('approvals');
	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processingApproval = $state<string | null>(null);

	const approvalRequests = $derived(activity.approvalRequests);
	const auditLog = $derived(activity.auditLog);
	const pendingApprovalsCount = $derived(activity.pendingApprovalsCount);
	const pendingApprovals = $derived(approvalRequests.filter((request) => request.status === 'pending'));
	const visibleApprovals = $derived(pendingApprovals.slice(0, 4));
	const visibleAuditLogs = $derived(auditLog.logs.slice(0, 9));
	const archivesHref = $derived(resolve(`/org/${orgId}/settings/archives`));
	const logsHref = $derived(resolve(`/org/${orgId}/settings/logs`));
	const activeTab = $derived(lockedTab ?? activityTab);
	const auditColumns: ColumnDef<AuditLogEntry>[] = [
		{
			key: 'time',
			header: 'Time',
			value: (log) => formatAuditTimestamp(log.createdAt),
			sortable: true,
			compare: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			width: '9rem'
		},
		{
			key: 'area',
			header: 'Area',
			value: (log) => getAuditActionParts(log.action).area,
			searchable: true,
			sortable: true
		},
		{
			key: 'event',
			header: 'Event',
			value: (log) => getAuditActionParts(log.action).event,
			searchable: true,
			sortable: true
		},
		{
			key: 'actor',
			header: 'Actor',
			value: (log) => log.actor ?? 'System',
			searchable: true,
			sortable: true,
			align: 'right'
		}
	];

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

<aside class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label="Settings activity">
	{#if collapsed}
		<Button type="button" aria-label="Show activity panel" variant="outline" onclick={() => (collapsed = false)}>
			Activity
		</Button>
	{:else}
		<Tabs.Root bind:value={activityTab} class="grid gap-4">
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				{#if lockedTab}
					<div class="grid gap-1">
						<h3 class="font-medium">{lockedTab === 'approvals' ? 'Approval Requests' : 'Audit Log'}</h3>
						<p class="text-sm text-muted-foreground">
							{lockedTab === 'approvals' ? `${pendingApprovalsCount} pending` : `${auditLog.totalCount} entries`}
						</p>
					</div>
				{:else}
					<Tabs.List>
						<Tabs.Trigger value="approvals">Approvals {pendingApprovalsCount}</Tabs.Trigger>
						<Tabs.Trigger value="audit">Audit Log</Tabs.Trigger>
					</Tabs.List>
					<Button type="button" variant="outline" size="sm" aria-label="Collapse" onclick={() => (collapsed = true)}>
						Hide
					</Button>
				{/if}
			</div>
			{#if activeTab === 'approvals'}
				<div class="grid gap-3" aria-label="Pending approval requests">
					{#each visibleApprovals as request (request.id)}
						<article class="grid gap-2 rounded-md border p-3">
							<header>
								<strong>{request.requester_email ?? 'Unknown requester'}</strong>
							</header>
							{#if request.resource_url}
								<a
									class="text-sm font-medium underline-offset-4 hover:underline"
									href={resolve(request.resource_url as '/')}
								>
									{request.resource_description ?? request.resource_type}
								</a>
							{:else}
								<p class="text-sm font-medium">{request.resource_description ?? request.resource_type}</p>
							{/if}
							<div class="grid gap-2">
								<span class="text-sm text-muted-foreground">{formatRelativeDate(request.created_at)} · Pending</span>
								{#if denyingId === request.id}
									<div class="flex flex-wrap gap-2">
										<Input
											type="text"
											aria-label="Denial reason"
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
										<Button
											variant="destructive"
											size="sm"
											disabled={processingApproval === request.id}
											onclick={() => handleApprovalAction(request.id, 'deny', denialReason)}
										>
											{#if processingApproval === request.id}<Spinner />{/if}
											Confirm
										</Button>
									</div>
								{:else}
									<div class="flex flex-wrap gap-2">
										<Button
											size="sm"
											disabled={processingApproval === request.id}
											onclick={() => handleApprovalAction(request.id, 'approve')}
										>
											{#if processingApproval === request.id}<Spinner />{/if}
											Approve
										</Button>
										<Button variant="outline" size="sm" onclick={() => (denyingId = request.id)}>Deny</Button>
									</div>
								{/if}
							</div>
						</article>
					{/each}
					{#if pendingApprovals.length === 0}
						<p class="text-sm text-muted-foreground">No pending requests.</p>
					{:else if pendingApprovals.length <= visibleApprovals.length}
						<p class="text-sm text-muted-foreground">No more pending requests.</p>
					{:else}
						<Button href={archivesHref} variant="outline" size="sm">
							View all {pendingApprovals.length} pending requests
						</Button>
					{/if}
				</div>
			{/if}

			{#if activeTab === 'audit'}
				<div class="grid gap-3" aria-label="Recent audit log entries">
					<DataTable.DataTable
						data={visibleAuditLogs}
						columns={auditColumns}
						ariaLabel="Recent audit log entries"
						emptyMessage="No audit log entries yet."
						density="dense"
						pageSize={9}
						initialSortKey="time"
						initialSortDirection="desc"
					>
						{#snippet cell(log: AuditLogEntry, column: ColumnDef<AuditLogEntry>)}
							{#if column.key === 'time'}
								<time class="text-sm text-muted-foreground" datetime={log.createdAt}>
									{formatAuditTimestamp(log.createdAt)}
								</time>
							{:else if column.key === 'area'}
								<span class="font-medium">{getAuditActionParts(log.action).area}</span>
							{:else if column.key === 'event'}
								<span>{getAuditActionParts(log.action).event}</span>
							{:else if column.key === 'actor'}
								<span class="block max-w-56 truncate text-muted-foreground">{log.actor ?? 'System'}</span>
							{:else}
								{String(column.value(log))}
							{/if}
						{/snippet}
					</DataTable.DataTable>
					{#if !lockedTab && auditLog.totalCount > visibleAuditLogs.length}
						<Button href={logsHref} variant="outline" size="sm">
							View all {auditLog.totalCount} entries
						</Button>
					{/if}
				</div>
			{/if}
		</Tabs.Root>
	{/if}
</aside>
