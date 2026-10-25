<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '../adminTheme';
	import { createInboxActions } from './inboxActions.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';

	let { detail, onChanged }: InboxDetailProps<'accessRequest'> = $props();

	const actions = createInboxActions((succeeded) => {
		if (succeeded) rejecting = false;
		onChanged();
	});
	onDestroy(() => actions.dispose());

	let rejecting = $state(false);
	let reason = $state('');

	const isOpen = $derived(detail.status === 'pending');
</script>

<svelte:window onpageshow={(event) => event.persisted && actions.steppingUp && actions.resumeAfterStepUp()} />

<TypeWorkspace.Stack>
	<div class="grid gap-3">
		<TypeWorkspace.DetailHeader title={detail.name} />
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant="outline">Closed beta</Badge>
			{#if !isOpen}
				<Badge variant={adminBadgeVariant(detail.status)}>{formatAdminLabel(detail.status)}</Badge>
			{/if}
		</div>
	</div>

	<TypeWorkspace.FactList>
		<TypeWorkspace.Fact label="Email">{detail.email}</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="What they wrote">
			{#if detail.reason}<span class="break-words whitespace-pre-wrap">{detail.reason}</span>{:else}Nothing written.{/if}
		</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="How they found us">{detail.heardAbout ?? 'Not given.'}</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="Requested">{formatDisplayDateTime(detail.receivedAt)}</TypeWorkspace.Fact>
		{#if detail.reviewedAt}
			<TypeWorkspace.Fact label="Decided">{formatDisplayDateTime(detail.reviewedAt)}</TypeWorkspace.Fact>
		{/if}
		<TypeWorkspace.Fact label="Account">
			{detail.accountExists ? 'An account already exists for this email.' : 'No account exists for this email.'}
		</TypeWorkspace.Fact>
		<TypeWorkspace.Fact label="Similar Organization">
			{#if detail.similarOrganizations.length > 0}
				{detail.similarOrganizations.join(', ')}
			{:else}
				None found.
			{/if}
		</TypeWorkspace.Fact>
	</TypeWorkspace.FactList>

	{#if actions.steppingUp}
		<Alert.Root role="status">
			<Alert.Description>
				This action needs a fresh multi-factor check. Taking you to verify, then back to the Inbox. Nothing has been
				changed yet.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.error && !rejecting}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if isOpen}
		<TypeWorkspace.FooterActions class="flex-wrap">
			<form method="POST" action="?/approve" use:enhance={actions.enhanceFor('approve')}>
				<input type="hidden" name="id" value={detail.id} />
				<Button
					type="submit"
					disabled={actions.pending !== null && actions.pending !== 'approve'}
					aria-disabled={actions.pending === 'approve' ? 'true' : undefined}
					aria-busy={actions.pending === 'approve' || undefined}
				>
					{#if actions.pending === 'approve'}<Spinner />{/if}
					Approve and send setup link
				</Button>
			</form>
			<Button variant="outline" disabled={actions.pending !== null} onclick={() => (rejecting = true)}>Reject</Button>
		</TypeWorkspace.FooterActions>
	{/if}
</TypeWorkspace.Stack>

{#if rejecting}
	<AppDialog.Root open busy={actions.pending === 'reject'} onClose={() => (rejecting = false)}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Reject {detail.name}</AppDialog.Title>
				<AppDialog.Description>
					The request closes and no setup link is sent. The reason stays in Activity for you and is not shared with the
					person.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<form
					id="reject-access-request-form"
					method="POST"
					action="?/reject"
					use:enhance={actions.enhanceFor('reject')}
				>
					<input type="hidden" name="id" value={detail.id} />
					<Field.Root>
						<Field.Label for="reject-reason">Reason (optional)</Field.Label>
						<Field.Control>
							<Textarea id="reject-reason" name="reason" rows={3} maxlength={500} bind:value={reason} />
						</Field.Control>
					</Field.Root>
				</form>
				{#if actions.error}
					<Alert.Root variant="destructive" class="mt-3">
						<Alert.Description>{actions.error}</Alert.Description>
					</Alert.Root>
				{/if}
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button variant="outline" disabled={actions.pending === 'reject'} onclick={() => (rejecting = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					form="reject-access-request-form"
					variant="destructive"
					aria-disabled={actions.pending === 'reject' ? 'true' : undefined}
					aria-busy={actions.pending === 'reject' || undefined}
				>
					{#if actions.pending === 'reject'}<Spinner />{/if}
					Reject request
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
