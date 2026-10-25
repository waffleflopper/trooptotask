<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { adminBadgeVariant, formatAdminLabel } from '../adminTheme';
	import { createInboxActions } from './inboxActions.svelte';
	import InboxDetailHeader from './InboxDetailHeader.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';
	import InboxFacts from './InboxFacts.svelte';
	import { formatWhen } from './inboxFormat';

	let { detail, onChanged }: InboxDetailProps<'accessRequest'> = $props();

	const actions = createInboxActions((succeeded) => {
		if (succeeded) rejecting = false;
		onChanged();
	});
	onDestroy(() => actions.dispose());

	let rejecting = $state(false);
	let reason = $state('');

	const now = new Date();
	const isOpen = $derived(detail.status === 'pending');
	const badges = $derived([
		{ label: 'Closed beta', variant: 'warning' as const },
		...(isOpen ? [] : [{ label: formatAdminLabel(detail.status), variant: adminBadgeVariant(detail.status) }])
	]);
	const facts = $derived([
		{ label: 'How they got here', value: detail.heardAbout ?? 'They did not say.' },
		{
			label: 'Existing account',
			value: detail.accountExists ? 'An account already uses this email' : 'None with this email'
		},
		{
			label: 'Same unit already here',
			value:
				detail.similarOrganizations.length > 0
					? detail.similarOrganizations.join(', ')
					: 'No Organization with a similar name'
		},
		...(detail.reviewedAt ? [{ label: 'Decided', value: formatWhen(detail.reviewedAt, now) }] : [])
	]);
</script>

<svelte:window onpageshow={(event) => event.persisted && actions.steppingUp && actions.resumeAfterStepUp()} />

<article class="grid max-w-[620px] gap-6">
	<InboxDetailHeader
		tone="accent"
		eyebrow="Access request"
		{badges}
		title={detail.name}
		meta={`${detail.email} · asked ${formatWhen(detail.receivedAt, now)}`}
	/>

	{#if detail.reason}
		<blockquote
			class="border-l-2 border-foreground py-0.5 pl-[18px] text-[17px] leading-[27px] break-words whitespace-pre-wrap italic"
		>
			“{detail.reason}”
		</blockquote>
	{:else}
		<p class="text-sm text-muted-foreground">They did not write anything.</p>
	{/if}

	<InboxFacts {facts} />

	{#if actions.steppingUp}
		<Alert.Root role="status">
			<Alert.Description>
				This action needs a fresh multi-factor check. Taking you to verify, then back to the Inbox. Nothing has been
				changed yet.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.notice}
		<Alert.Root variant="destructive" role="status">
			<Alert.Description>{actions.notice}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.error && !rejecting}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if isOpen}
		<div class="grid gap-2.5">
			<div class="flex flex-wrap items-center gap-2">
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
				<Button variant="destructive" disabled={actions.pending !== null} onclick={() => (rejecting = true)}>
					Reject
				</Button>
			</div>
			<p class="text-[13px] leading-[19px] text-muted-foreground">
				The setup link is good for 14 days. Approving does not create an Organization. They do that after setting up
				their account.
			</p>
		</div>
	{/if}
</article>

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
					<!-- The form data is read at submit, before this locks, so the reason still goes with the request. -->
					<fieldset disabled={actions.pending === 'reject'}>
						<Field.Root>
							<Field.Label for="reject-reason">Reason (optional)</Field.Label>
							<Field.Control>
								<Textarea id="reject-reason" name="reason" rows={3} maxlength={500} bind:value={reason} />
							</Field.Control>
						</Field.Root>
					</fieldset>
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
