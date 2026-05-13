<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';

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

<PageShell.Root width="content" density="compact">
	<PageShell.Header
		title="Beta Feedback"
		subtitle="Sort incoming bug reports, feature requests, and tester notes without losing the audit trail."
	/>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric label="Total Items" value={totalCount} detail="Every retained feedback item." />
		<PageShell.Metric label="New Items" value={data.newItems.length} detail="Unread items waiting on first review." />
	</PageShell.FactGrid>

	{#if form?.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{form.error}</Alert.Description>
		</Alert.Root>
	{/if}

	<Tabs.Root bind:value={activeTab} class="grid gap-4">
		<Tabs.List class="w-full justify-start">
			<Tabs.Trigger value="new">
				New {#if data.newItems.length > 0}<Badge variant="secondary">{data.newItems.length}</Badge>{/if}
			</Tabs.Trigger>
			<Tabs.Trigger value="reviewed">
				Reviewed {#if data.reviewedItems.length > 0}<Badge variant="secondary">{data.reviewedItems.length}</Badge>{/if}
			</Tabs.Trigger>
			<Tabs.Trigger value="resolved">
				Resolved {#if data.resolvedItems.length > 0}<Badge variant="secondary">{data.resolvedItems.length}</Badge>{/if}
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value={activeTab} class="grid gap-3">
			{#if currentItems.length === 0}
				<Card.Root>
					<Card.Content>
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>No {activeTab} feedback.</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					</Card.Content>
				</Card.Root>
			{:else}
				{#each currentItems as item (item.id)}
					<Card.Root>
						<Card.Header>
							<button
								class="grid w-full gap-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
								onclick={() => (expandedId = expandedId === item.id ? null : item.id)}
							>
								<span class="grid min-w-0 gap-2">
									<span class="flex min-w-0 flex-wrap items-center gap-2">
										<strong class="truncate text-sm">{item.user_email}</strong>
										<Badge variant={adminBadgeVariant(item.category)}>{formatAdminLabel(item.category)}</Badge>
									</span>
									<span class="text-sm leading-6 text-muted-foreground">
										{item.message.length > 140 ? `${item.message.slice(0, 140)}...` : item.message}
									</span>
									<span class="text-xs text-muted-foreground">
										{formatDisplayDateTime(item.created_at)}
										{#if item.organization_name}
											/ {item.organization_name}{/if}
										{#if item.page_url}
											/ {item.page_url}{/if}
									</span>
								</span>
								<span class="text-xs font-medium text-muted-foreground uppercase">
									{expandedId === item.id ? 'Hide' : 'Open'}
								</span>
							</button>
						</Card.Header>

						{#if expandedId === item.id}
							<Card.Content class="grid gap-4">
								<div class="grid gap-2 rounded-lg border bg-muted/40 p-4">
									<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Full Message</p>
									<p class="text-sm leading-6">{item.message}</p>
								</div>

								<form
									method="POST"
									action="?/update"
									class="grid gap-4"
									use:enhance={() => {
										savingId = item.id;
										return async ({ update }) => {
											savingId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="feedbackId" value={item.id} />
									<div class="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
										<Field.Root>
											<Field.Label for="status-{item.id}">Status</Field.Label>
											<NativeSelect id="status-{item.id}" name="status" value={item.status}>
												<option value="new">New</option>
												<option value="reviewed">Reviewed</option>
												<option value="resolved">Resolved</option>
											</NativeSelect>
										</Field.Root>
										<Field.Root>
											<Field.Label for="notes-{item.id}">Admin Notes</Field.Label>
											<Textarea
												id="notes-{item.id}"
												name="adminNotes"
												rows={4}
												placeholder="Internal notes about this feedback..."
												value={item.admin_notes || ''}
											></Textarea>
										</Field.Root>
									</div>

									<div class="flex justify-end">
										<Button type="submit" disabled={savingId !== null}>
											{#if savingId === item.id}<Spinner />{/if}
											Save Notes
										</Button>
									</div>
								</form>
							</Card.Content>
						{/if}
					</Card.Root>
				{/each}
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</PageShell.Root>
