<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick, untrack } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { FeedbackStatus } from '$features/feedback/contracts';
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { restoreFocus, settleAction } from '$lib/utils/settleAction';

	let { data, form } = $props();
	let activeTab = $state<'new' | 'reviewed' | 'resolved'>('new');
	let editor = $state<{ id: string; status: FeedbackStatus; notes: string } | null>(null);
	let triggers = $state<Record<string, HTMLButtonElement | null>>({});
	let tabTriggers = $state<Record<string, HTMLButtonElement | null>>({});
	let reloadButton = $state<HTMLButtonElement | null>(null);
	let pending = $state<{ kind: 'save'; id: string } | { kind: 'reload' } | null>(null);
	let needsReload = $state(false);
	let actionError = $state<string | null | undefined>(undefined);
	const displayedError = $derived(actionError === undefined ? form?.error : actionError);
	const writesDisabled = $derived(pending !== null || needsReload);
	let pageLifetime = 0;
	let editorLifetime = 0;
	let requestId = 0;
	let currentActor = untrack(() => data.adminUserId);

	function closeEditor() {
		editorLifetime += 1;
		editor = null;
		actionError = null;
	}
	function setEditorOpen(item: PageData['newItems'][number], open: boolean) {
		closeEditor();
		if (open) editor = { id: item.id, status: item.status, notes: item.admin_notes ?? '' };
	}
	function retirePage() {
		pageLifetime += 1;
		closeEditor();
		pending = null;
		needsReload = false;
	}
	beforeNavigate(retirePage);
	onDestroy(retirePage);
	$effect(() => {
		if (data.adminUserId !== currentActor) {
			currentActor = data.adminUserId;
			retirePage();
		}
	});

	async function reloadFeedback() {
		if (pending) return;
		const lifetime = pageLifetime;
		const actorId = data.adminUserId;
		const token = ++requestId;
		const isCurrent = () => pageLifetime === lifetime && data.adminUserId === actorId && requestId === token;
		pending = { kind: 'reload' };
		actionError = null;
		try {
			await invalidateAll();
			if (isCurrent()) needsReload = false;
		} catch {
			if (isCurrent()) actionError = 'Feedback could not be refreshed. Reload it before another save.';
		}
		if (!isCurrent()) return;
		pending = null;
		await tick();
		if (isCurrent()) restoreFocus([reloadButton, editor ? triggers[editor.id] : null, tabTriggers[activeTab]]);
	}
	const submitFeedback =
		(id: string): SubmitFunction =>
		({ cancel, formElement, submitter }) => {
			if (writesDisabled) {
				cancel();
				return;
			}
			const lifetime = pageLifetime;
			const actorId = data.adminUserId;
			const expectedEditor = editorLifetime;
			const token = ++requestId;
			const isCurrent = () => pageLifetime === lifetime && data.adminUserId === actorId && requestId === token;
			const isCurrentEditor = () =>
				isCurrent() && editorLifetime === expectedEditor && editor?.id === id && formElement.isConnected;
			pending = { kind: 'save', id };
			actionError = null;
			return async ({ result, update }) => {
				// A 5xx or an unexpected error may have saved, so saves wait for a read-only reload.
				const unconfirmed = result.type === 'error' || (result.type === 'failure' && result.status >= 500);
				// The open editor keeps its Status and Notes after a save, so the form is not reset.
				await settleAction(
					{ result, update: () => update({ reset: false }) },
					{
						isCurrent,
						settled: (error) => {
							pending = null;
							if (unconfirmed || error) needsReload = true;
							if (unconfirmed) {
								if (isCurrentEditor())
									actionError = 'The save result could not be confirmed. Check current feedback before trying again.';
							} else if (error) {
								actionError = 'Saved, but feedback could not be refreshed. Reload it before another save.';
							} else if (result.type === 'failure') {
								if (isCurrentEditor())
									actionError =
										typeof result.data?.error === 'string' ? result.data.error : 'Feedback could not be saved.';
							} else if (result.type === 'success') {
								toastStore.success('Feedback saved');
							}
						},
						focus: () => [submitter, triggers[id], tabTriggers[activeTab]]
					}
				);
			};
		};

	const tabs = $derived([
		{ value: 'new', label: 'New', items: data.newItems },
		{ value: 'reviewed', label: 'Reviewed', items: data.reviewedItems },
		{ value: 'resolved', label: 'Resolved', items: data.resolvedItems }
	] as const);
	const totalCount = $derived(data.newItems.length + data.reviewedItems.length + data.resolvedItems.length);
</script>

<svelte:head>
	<title>Feedback - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="content" density="compact">
	<PageShell.Header
		title="Feedback"
		subtitle="Sort incoming bug reports, feature requests, and tester notes without losing the audit trail."
	/>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric label="Total Items" value={totalCount} detail="Every retained feedback item." />
		<PageShell.Metric label="New Items" value={data.newItems.length} detail="Unread items waiting on first review." />
	</PageShell.FactGrid>

	{#if displayedError}
		<Alert.Root variant="destructive">
			<Alert.Description>{displayedError}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if needsReload}
		<Alert.Root variant="warning">
			<Alert.Description>Check current feedback before another save.</Alert.Description>
			<Button
				bind:ref={reloadButton}
				class="mt-1 w-fit"
				variant="outline"
				onclick={reloadFeedback}
				aria-disabled={pending ? 'true' : undefined}
				aria-busy={pending?.kind === 'reload' || undefined}
			>
				{#if pending?.kind === 'reload'}<Spinner />{/if}
				Reload Feedback
			</Button>
		</Alert.Root>
	{/if}

	<Tabs.Root bind:value={activeTab} onValueChange={closeEditor} class="grid gap-4">
		<Tabs.List class="w-full justify-start">
			{#each tabs as tab (tab.value)}
				<Tabs.Trigger
					value={tab.value}
					bind:ref={() => tabTriggers[tab.value] ?? null, (element) => (tabTriggers[tab.value] = element)}
				>
					{tab.label}
					{#if tab.items.length > 0}<Badge variant="secondary">{tab.items.length}</Badge>{/if}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		{#each tabs as tab (tab.value)}
			<Tabs.Content value={tab.value} class="grid gap-3">
				{@render feedbackList(tab.value, tab.items)}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</PageShell.Root>

{#snippet feedbackList(status: FeedbackStatus, items: PageData['newItems'])}
	{#if items.length === 0}
		<Card.Root>
			<Card.Content>
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No {status} feedback.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			</Card.Content>
		</Card.Root>
	{:else}
		{#each items as item (item.id)}
			<Card.Root>
				<Collapsible.Root open={editor?.id === item.id} onOpenChange={(open) => setEditorOpen(item, open)}>
					<Collapsible.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								bind:ref={() => triggers[item.id] ?? null, (element) => (triggers[item.id] = element)}
								variant="ghost"
								size="none"
								class="grid h-auto w-full gap-3 rounded-md px-4 py-3 text-left font-normal whitespace-normal sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
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
									{editor?.id === item.id ? 'Hide' : 'Open'}
								</span>
							</Button>
						{/snippet}
					</Collapsible.Trigger>
					<Collapsible.Content>
						{#if editor && editor.id === item.id}
							<Card.Content class="grid gap-4 border-t">
								<div class="grid gap-2 rounded-lg border bg-muted/40 p-4">
									<p class="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Full Message</p>
									<p class="text-sm leading-6">{item.message}</p>
								</div>

								<form method="POST" action="?/update" class="grid gap-4" use:enhance={submitFeedback(item.id)}>
									<input type="hidden" name="feedbackId" value={item.id} />
									<div class="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
										<Field.Root>
											<Field.Label for="status-{item.id}">Status</Field.Label>
											<NativeSelect id="status-{item.id}" name="status" bind:value={editor.status}>
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
												bind:value={editor.notes}
											></Textarea>
										</Field.Root>
									</div>

									<div class="flex justify-end">
										<Button
											type="submit"
											disabled={needsReload}
											aria-disabled={pending ? 'true' : undefined}
											aria-busy={(pending?.kind === 'save' && pending.id === item.id) || undefined}
										>
											{#if pending?.kind === 'save' && pending.id === item.id}<Spinner />{/if}
											Save Notes
										</Button>
									</div>
								</form>
							</Card.Content>
						{/if}
					</Collapsible.Content>
				</Collapsible.Root>
			</Card.Root>
		{/each}
	{/if}
{/snippet}
