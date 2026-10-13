<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { TriangleAlert } from '@lucide/svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import * as Table from '$lib/components/ui/table';
	import { formatDisplayDate } from '$lib/utils/dates';
	import AdminPager from '$features/platform-admin/components/AdminPager.svelte';
	import { createAdminUrlSearch } from '$features/platform-admin/components/adminUrlSearch.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data } = $props();

	const organizationsRouteRoot = resolve('/admin/organizations');
	const statusFilter = $derived(data.pagination.status ?? 'all');
	type ActivationOrganization = NonNullable<PageData['activationHealth']>['organizations'][number];
	const activationHealth = $derived(
		data.activationHealth ?? {
			generatedAt: '',
			overallState: 'diagnostics_unavailable',
			candidateLimit: 100,
			counts: {
				candidateOrganizations: 0,
				activatedOrganizations: 0,
				meaningfulRosters: 0,
				acceptedLeaders: 0,
				setupStarted: 0,
				inProgressOrganizations: 0
			},
			organizations: [],
			diagnosticsError: true
		}
	);

	const showingStart = $derived(
		data.organizations.length === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1
	);
	const showingEnd = $derived(
		data.organizations.length === 0
			? 0
			: Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)
	);

	function pageHref(pageNumber: number): string {
		const params = new SvelteURLSearchParams();
		params.set('page', pageNumber.toString());
		params.set('pageSize', data.pagination.pageSize.toString());
		if (data.pagination.q) params.set('q', data.pagination.q);
		if (statusFilter !== 'all') params.set('status', statusFilter);
		return `${organizationsRouteRoot}?${params.toString()}`;
	}

	function applyFilters(next: { q: string; pageSize: string; status: string }) {
		const params = new SvelteURLSearchParams();
		params.set('page', '1');
		params.set('pageSize', next.pageSize);
		if (next.q) params.set('q', next.q);
		if (next.status !== 'all') params.set('status', next.status);
		goto(resolve(`/admin/organizations?${params.toString()}`), { keepFocus: true });
	}

	const search = createAdminUrlSearch(
		() => data.pagination.q,
		(q) => applyFilters({ q, pageSize: String(data.pagination.pageSize), status: statusFilter })
	);

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'select',
			id: 'status',
			label: 'Status',
			options: [
				{ value: 'all', label: 'All statuses' },
				{ value: 'active', label: 'Active' },
				{ value: 'suspended', label: 'Suspended' }
			],
			value: statusFilter,
			defaultValue: 'all',
			onValueChange: (status) => applyFilters({ q: search.value, pageSize: String(data.pagination.pageSize), status })
		},
		{
			kind: 'select',
			id: 'rows',
			label: 'Rows',
			options: [
				{ value: '25', label: '25' },
				{ value: '50', label: '50' },
				{ value: '100', label: '100' }
			],
			value: String(data.pagination.pageSize),
			defaultValue: '25',
			onValueChange: (pageSize) => applyFilters({ q: search.value, pageSize, status: statusFilter })
		}
	]);

	function nextActivationStep(item: ActivationOrganization): string {
		return item.nextSteps[0] ?? 'Activation milestones are complete.';
	}

	function setupSummary(item: ActivationOrganization): string {
		const activation = item.supportBundle.activation;
		return `${activation.onboardingTemplateSteps} onboarding / ${activation.trainingTypes} training / ${activation.ratingSchemeEntries} evals`;
	}
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Organizations"
		subtitle="Review organization health, ownership, and suspension status from the central platform index."
	/>

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Matching Organizations"
			value={data.pagination.totalCount}
			detail="Organizations matching the current search."
		/>
		<PageShell.Metric
			label="Current Page"
			value={data.organizations.length}
			detail={`Page ${data.pagination.page} of ${data.pagination.totalPages}.`}
		/>
		<PageShell.Metric
			label="Activation in Progress"
			value={activationHealth.diagnosticsError ? 'Unavailable' : activationHealth.counts.inProgressOrganizations}
			detail={activationHealth.diagnosticsError
				? 'Activation health diagnostics could not be fully loaded.'
				: `Organizations with incomplete activation milestones. Counts cover up to ${activationHealth.candidateLimit} newest Organizations.`}
		/>
	</PageShell.FactGrid>

	{#if activationHealth.diagnosticsError}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Activation health diagnostics could not be fully loaded.</Alert.Title>
			<Alert.Description>
				Roster, member, and setup counts may be incomplete until the health scan succeeds.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header class="gap-2 lg:flex-row lg:items-start lg:justify-between">
			<div>
				<Card.Title>Acquisition and Activation Health</Card.Title>
				<Card.Description>
					{#if activationHealth.diagnosticsError}
						Activation health data is unavailable until diagnostics load successfully.
					{:else}
						{formatAdminLabel(activationHealth.overallState)} · {activationHealth.counts.candidateOrganizations}
						Organizations · {activationHealth.counts.activatedOrganizations} activated. Counts cover up to
						{activationHealth.candidateLimit} newest Organizations.
					{/if}
				</Card.Description>
			</div>
			<div class="flex flex-wrap gap-2">
				<Badge variant={adminBadgeVariant(activationHealth.overallState)}>
					{formatAdminLabel(activationHealth.overallState)}
				</Badge>
				{#if !activationHealth.diagnosticsError}
					<Badge variant="secondary">{activationHealth.counts.meaningfulRosters} meaningful rosters</Badge>
				{/if}
			</div>
		</Card.Header>
		<Card.Content>
			{#if activationHealth.diagnosticsError}
				<p class="text-sm text-muted-foreground">
					Activation health diagnostics are unavailable. Retry after the health scan succeeds.
				</p>
			{:else if activationHealth.organizations.length > 0}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Organization</Table.Head>
								<Table.Head>Health</Table.Head>
								<Table.Head>Roster</Table.Head>
								<Table.Head>Members</Table.Head>
								<Table.Head>Setup</Table.Head>
								<Table.Head>Next Action</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each activationHealth.organizations as item (item.id)}
								<Table.Row>
									<Table.Cell>
										<div class="grid min-w-48 gap-1">
											<a
												href={resolve(
													`/admin/organizations/${item.organization.id}` as `/admin/organizations/${string}`
												)}
												class="font-medium">{item.organization.name ?? item.organization.id}</a
											>
											<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
												{item.organization.id.slice(0, 8)}...
											</code>
										</div>
									</Table.Cell>
									<Table.Cell>
										<div class="grid gap-1">
											<Badge variant={adminBadgeVariant(item.state)}>{formatAdminLabel(item.state)}</Badge>
											<span class="text-xs text-muted-foreground">{item.score}% milestone coverage</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										{item.supportBundle.activation.activePersonnel} / {item.supportBundle.activation
											.meaningfulRosterThreshold}
									</Table.Cell>
									<Table.Cell>{item.supportBundle.activation.members}</Table.Cell>
									<Table.Cell>{setupSummary(item)}</Table.Cell>
									<Table.Cell class="max-w-80 text-sm text-muted-foreground">{nextActivationStep(item)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				{#if activationHealth.organizations.length < activationHealth.counts.candidateOrganizations}
					<p class="mt-3 text-xs text-muted-foreground">
						Showing top {activationHealth.organizations.length} of {activationHealth.counts.candidateOrganizations}
						candidates.
					</p>
				{/if}
			{:else}
				<p class="text-sm text-muted-foreground">No Organizations found for activation health.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<WorkspaceToolbar
		ariaLabel="Organizations controls"
		items={toolbarItems}
		search={{
			label: 'Search',
			placeholder: 'Search by organization name...',
			value: search.value,
			onValueChange: search.setValue
		}}
	/>

	<Card.Root class="overflow-hidden">
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Members</Table.Head>
						<Table.Head>Personnel</Table.Head>
						<Table.Head>Owner</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organizations as org (org.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid min-w-48 gap-1">
									<a
										href={resolve(`/admin/organizations/${org.id}` as `/admin/organizations/${string}`)}
										class="font-medium">{org.name}</a
									>
									<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
										{org.id.slice(0, 8)}...
									</code>
								</div>
							</Table.Cell>
							<Table.Cell>{org.memberCount}</Table.Cell>
							<Table.Cell>{org.personnelCount}</Table.Cell>
							<Table.Cell class="min-w-48 max-w-60 break-all whitespace-normal text-muted-foreground"
								>{org.ownerEmail || '-'}</Table.Cell
							>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(org.isSuspended ? 'suspended' : 'active')}>
									{org.isSuspended ? 'Suspended' : 'Active'}
								</Badge>
							</Table.Cell>
							<Table.Cell>{formatDisplayDate(org.created_at)}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6}>
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No matching organizations.</Empty.Title>
									</Empty.Header>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<Card.Footer class="text-sm text-muted-foreground">{data.organizations.length} shown</Card.Footer>
	</Card.Root>

	{#if data.pagination.totalCount > 0}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<p>Showing {showingStart}-{showingEnd} of {data.pagination.totalCount}</p>
			<AdminPager page={data.pagination.page} totalPages={data.pagination.totalPages} {pageHref} />
		</div>
	{/if}
</PageShell.Root>
