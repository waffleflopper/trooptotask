<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data, form } = $props();

	let searchInput = $derived(data.search);
	let loadingId = $state<string | null>(null);
	let giftingOrgId = $state<string | null>(null);
	let extendingOrgId = $state<string | null>(null);
	let giftTier = $state<'team' | 'unit'>('team');
	let giftDays = $state(30);
	let extendDays = $state(30);

	function applySearch() {
		const params = new SvelteURLSearchParams();
		if (searchInput) params.set('search', searchInput);
		goto(`/admin/gifting?${params.toString()}`);
	}

	function isGiftActive(org: (typeof data.organizations)[0]): boolean {
		return !!org.giftTier && !!org.giftExpiresAt && new Date(org.giftExpiresAt) > new Date();
	}

	function isGiftExpired(org: (typeof data.organizations)[0]): boolean {
		return !!org.giftTier && !!org.giftExpiresAt && new Date(org.giftExpiresAt) <= new Date();
	}
</script>

<svelte:head>
	<title>Gifting - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Organization Gifting"
		subtitle="Apply temporary paid access, extend an existing gift, or revoke an override without leaving the platform admin workspace."
	>
		{#snippet meta()}
			<Badge variant="secondary">Plan Overrides</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Tracked Orgs"
			value={data.organizations.length}
			detail="Organizations currently returned by the gifting search."
		/>
	</PageShell.FactGrid>

	{#if form?.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{form.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if form?.success}
		<Alert.Root variant="success">
			<Alert.Description>
				{#if form.action === 'gift'}
					Gift applied successfully.
				{:else if form.action === 'revoke'}
					Gift revoked successfully.
				{:else if form.action === 'extend'}
					Gift extended successfully.
				{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<form
				class="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_auto] sm:items-end"
				onsubmit={(event) => {
					event.preventDefault();
					applySearch();
				}}
			>
				<Field.Root>
					<Field.Label for="gifting-search">Search</Field.Label>
					<Field.Control>
						<Input
							id="gifting-search"
							type="text"
							placeholder="Search by org name or owner email..."
							bind:value={searchInput}
						/>
					</Field.Control>
				</Field.Root>
				<Button type="submit" variant="outline">Apply</Button>
			</form>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Organization</Table.Head>
						<Table.Head>Owner</Table.Head>
						<Table.Head>Tier</Table.Head>
						<Table.Head>Personnel</Table.Head>
						<Table.Head>Gift Status</Table.Head>
						<Table.Head>Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organizations as org (org.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid gap-1">
									<strong class="text-sm font-medium">{org.name}</strong>
									<span class="font-mono text-xs text-muted-foreground">{org.id.slice(0, 8)}...</span>
								</div>
							</Table.Cell>
							<Table.Cell class="max-w-56 break-words text-muted-foreground">{org.ownerEmail}</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant={adminBadgeVariant(org.tier)}>{formatAdminLabel(org.tier)}</Badge>
									{#if org.hasActiveSubscription}<Badge variant="info">Stripe</Badge>{/if}
								</div>
							</Table.Cell>
							<Table.Cell>{org.personnelCount}</Table.Cell>
							<Table.Cell>
								{#if isGiftActive(org)}
									<div class="grid gap-1">
										<Badge variant="warning">Gift: {formatAdminLabel(org.giftTier ?? '')}</Badge>
										<span class="text-muted-foreground">Expires {formatDisplayDateTime(org.giftExpiresAt)}</span>
									</div>
								{:else if isGiftExpired(org)}
									<div class="grid gap-1">
										<Badge variant="secondary">Expired</Badge>
										<span class="text-muted-foreground">Was {formatAdminLabel(org.giftTier ?? '')}</span>
									</div>
								{:else}
									<span class="text-muted-foreground">No gift</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="min-w-64">
								{#if giftingOrgId === org.id}
									<form
										method="POST"
										action="?/giftTier"
										class="flex flex-wrap items-center gap-2"
										use:enhance={() => {
											loadingId = `${org.id}-gift`;
											return async ({ update }) => {
												loadingId = null;
												giftingOrgId = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="orgId" value={org.id} />
										<NativeSelect name="giftTier" bind:value={giftTier}>
											<option value="team">Team</option>
											<option value="unit">Unit</option>
										</NativeSelect>
										<Input
											type="number"
											name="days"
											bind:value={giftDays}
											min="1"
											max="365"
											class="w-[92px]"
											placeholder="Days"
										/>
										<Button type="submit" disabled={loadingId !== null}>
											{#if loadingId === `${org.id}-gift`}<Spinner />{/if}
											Apply
										</Button>
										<Button type="button" variant="outline" onclick={() => (giftingOrgId = null)}>Cancel</Button>
									</form>
								{:else if extendingOrgId === org.id}
									<form
										method="POST"
										action="?/extendGift"
										class="flex flex-wrap items-center gap-2"
										use:enhance={() => {
											loadingId = `${org.id}-extend`;
											return async ({ update }) => {
												loadingId = null;
												extendingOrgId = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="orgId" value={org.id} />
										<Input
											type="number"
											name="days"
											bind:value={extendDays}
											min="1"
											max="365"
											class="w-[92px]"
											placeholder="Days"
										/>
										<Button type="submit" disabled={loadingId !== null}>
											{#if loadingId === `${org.id}-extend`}<Spinner />{/if}
											Extend
										</Button>
										<Button type="button" variant="outline" onclick={() => (extendingOrgId = null)}>Cancel</Button>
									</form>
								{:else}
									<div class="flex flex-wrap items-center gap-2">
										<Button
											onclick={() => {
												giftingOrgId = org.id;
												extendingOrgId = null;
											}}
										>
											Gift
										</Button>
										{#if isGiftActive(org)}
											<Button
												variant="outline"
												onclick={() => {
													extendingOrgId = org.id;
													giftingOrgId = null;
												}}
											>
												Extend
											</Button>
											<form
												method="POST"
												action="?/revokeGift"
												use:enhance={() => {
													loadingId = `${org.id}-revoke`;
													return async ({ update }) => {
														loadingId = null;
														await update();
													};
												}}
											>
												<input type="hidden" name="orgId" value={org.id} />
												<Button type="submit" variant="destructive" disabled={loadingId !== null}>
													{#if loadingId === `${org.id}-revoke`}<Spinner />{/if}
													Revoke
												</Button>
											</form>
										{/if}
									</div>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={6}>
								<Empty.Root class="border-0">No organizations found.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</PageShell.Root>
