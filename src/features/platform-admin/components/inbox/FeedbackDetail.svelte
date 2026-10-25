<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '../adminTheme';
	import { createInboxActions } from './inboxActions.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';

	let { detail, onChanged }: InboxDetailProps<'feedback'> = $props();

	const actions = createInboxActions(() => onChanged());
	onDestroy(() => actions.dispose());

	const isOpen = $derived(detail.status !== 'resolved');
	const page = $derived([detail.pageUrl, detail.pageSection].filter(Boolean).join(' · '));
</script>

<TypeWorkspace.Stack>
	<div class="grid gap-3">
		<TypeWorkspace.DetailHeader title={`${formatAdminLabel(detail.category)} feedback`} />
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant={adminBadgeVariant(detail.category)}>{formatAdminLabel(detail.category)}</Badge>
			{#if !isOpen}<Badge variant="success">Closed</Badge>{/if}
		</div>
	</div>

	<p class="rounded-md border bg-muted/30 p-4 text-sm leading-6 break-words whitespace-pre-wrap">{detail.message}</p>

	<TypeWorkspace.FactList>
		<TypeWorkspace.Fact label="Person">{detail.person}</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="Organization">{detail.organizationName ?? 'None.'}</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="Page"><span class="break-all">{page || 'Not recorded.'}</span></TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="Received">{formatDisplayDateTime(detail.receivedAt)}</TypeWorkspace.Fact>
		{#if detail.closedAt}
			<TypeWorkspace.Fact label="Closed">{formatDisplayDateTime(detail.closedAt)}</TypeWorkspace.Fact>
		{/if}
	</TypeWorkspace.FactList>

	{#if actions.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if isOpen}
		<TypeWorkspace.FooterActions>
			<form method="POST" action="?/close" use:enhance={actions.enhanceFor('close')}>
				<input type="hidden" name="id" value={detail.id} />
				<Button
					type="submit"
					variant="outline"
					aria-disabled={actions.pending === 'close' ? 'true' : undefined}
					aria-busy={actions.pending === 'close' || undefined}
				>
					{#if actions.pending === 'close'}<Spinner />{/if}
					Close without replying
				</Button>
			</form>
		</TypeWorkspace.FooterActions>
	{/if}
</TypeWorkspace.Stack>
