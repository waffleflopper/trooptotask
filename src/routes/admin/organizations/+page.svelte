<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');

	const filteredOrgs = $derived.by(() => {
		let result = data.organizations;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter((org) => org.name.toLowerCase().includes(q) || org.ownerEmail.toLowerCase().includes(q));
		}

		if (tierFilter !== 'all') result = result.filter((org) => org.effectiveTier === tierFilter);
		if (statusFilter === 'active') result = result.filter((org) => !org.isSuspended);
		if (statusFilter === 'suspended') result = result.filter((org) => org.isSuspended);

		return result;
	});
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Organizations"
		subtitle="Review organization health, ownership, plan state, and suspension status from the central platform index."
	/>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Total Organizations"
			value={data.organizations.length}
			detail="Every organization attached to the platform."
		/>
		<PageShell.Metric
			label="Filtered View"
			value={filteredOrgs.length}
			detail="Organizations matching current filters."
		/>
	</PageShell.FactGrid>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<div class="grid flex-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]">
				<Field.Root>
					<Field.Label for="org-search">Search</Field.Label>
					<Input id="org-search" type="text" placeholder="Search by name or owner email..." bind:value={searchInput} />
				</Field.Root>
				<Field.Root>
					<Field.Label for="tier-filter">Tier</Field.Label>
					<NativeSelect id="tier-filter" bind:value={tierFilter}>
						<option value="all">All tiers</option>
						<option value="free">Free</option>
						<option value="team">Team</option>
						<option value="unit">Unit</option>
					</NativeSelect>
				</Field.Root>
				<Field.Root>
					<Field.Label for="status-filter">Status</Field.Label>
					<NativeSelect id="status-filter" bind:value={statusFilter}>
						<option value="all">All statuses</option>
						<option value="active">Active</option>
						<option value="suspended">Suspended</option>
					</NativeSelect>
				</Field.Root>
			</div>
			<span class="text-sm text-muted-foreground">{filteredOrgs.length} matched</span>
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-hidden">
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Tier</Table.Head>
						<Table.Head>Members</Table.Head>
						<Table.Head>Personnel</Table.Head>
						<Table.Head>Owner</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredOrgs as org (org.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid min-w-48 gap-1">
									<a href="/admin/organizations/{org.id}" class="font-medium">{org.name}</a>
									<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
										{org.id.slice(0, 8)}...
									</code>
								</div>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap gap-2">
									<Badge variant={adminBadgeVariant(org.effectiveTier)}>{formatAdminLabel(org.effectiveTier)}</Badge>
									{#if org.gift_tier}
										<Badge variant="warning">Gift</Badge>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>{org.memberCount}</Table.Cell>
							<Table.Cell>{org.personnelCount}</Table.Cell>
							<Table.Cell class="max-w-60 break-words text-muted-foreground">{org.ownerEmail || '-'}</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(org.isSuspended ? 'suspended' : 'active')}>
									{org.isSuspended ? 'Suspended' : 'Active'}
								</Badge>
							</Table.Cell>
							<Table.Cell>{formatDisplayDate(org.created_at)}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7}>
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No organizations found.</Empty.Title>
									</Empty.Header>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Root>
</PageShell.Root>
