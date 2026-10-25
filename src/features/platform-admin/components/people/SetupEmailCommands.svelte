<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import { createInboxActions } from '../inbox/inboxActions.svelte';

	interface Props {
		name: string;
		/** The setup link an Inbox item is about. Pages whose URL names the request send nothing. */
		linkId?: string;
		/** Offers Ask the inviter: true when a current member can be asked, false when none can. Omit where it never applies. */
		canAskInviter?: boolean;
		/** Which command leads: the dark button. */
		primary?: 'ask' | 'resend';
		/** A resolved item keeps no commands. */
		disabled?: boolean;
		/** Runs after any settled command, so the page can read what changed. */
		onSettled: (succeeded: boolean, action: string | null) => void;
		/** A command that ends the person's access leaves the page it was run from. */
		onRescinded?: () => void;
	}

	let { name, linkId, canAskInviter, primary = 'resend', disabled = false, onSettled, onRescinded }: Props = $props();

	let confirmingRescind = $state(false);
	let rescindForm = $state<HTMLFormElement | null>(null);
	let lastAction: string | null = null;

	const actions = createInboxActions((succeeded) => {
		confirmingRescind = false;
		onSettled(succeeded, lastAction);
		if (succeeded && lastAction === 'rescindAccess') onRescinded?.();
	});
	onDestroy(() => actions.dispose());

	function run(command: string): ReturnType<typeof actions.enhanceFor> {
		const submit = actions.enhanceFor(command);
		return (input) => {
			lastAction = command;
			return submit(input);
		};
	}

	const busy = $derived(actions.pending !== null);
	const askLeads = $derived(primary === 'ask' && canAskInviter === true);
</script>

<svelte:window onpageshow={(event) => event.persisted && actions.steppingUp && actions.resumeAfterStepUp()} />

{#snippet idField()}
	{#if linkId}<input type="hidden" name="id" value={linkId} />{/if}
{/snippet}

<div class="grid gap-3">
	{#if actions.steppingUp}
		<Alert.Root role="status">
			<Alert.Description>
				This action needs a fresh multi-factor check. Taking you to verify, then back here. Nothing has been changed
				yet.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.notice}
		<Alert.Root role="status">
			<Alert.Description>{actions.notice}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.confirmation}
		<Alert.Root role="status">
			<Alert.Description>{actions.confirmation}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if actions.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		{#if canAskInviter !== undefined}
			<form method="POST" action="?/askInviter" use:enhance={run('askInviter')}>
				{@render idField()}
				<Button
					type="submit"
					variant={askLeads ? 'default' : 'outline'}
					disabled={disabled || canAskInviter === false || (busy && actions.pending !== 'askInviter')}
					aria-disabled={actions.pending === 'askInviter' ? 'true' : undefined}
					aria-busy={actions.pending === 'askInviter' || undefined}
				>
					{#if actions.pending === 'askInviter'}<Spinner />{/if}
					Ask the inviter to check the address
				</Button>
			</form>
		{/if}
		<form method="POST" action="?/resendSetup" use:enhance={run('resendSetup')}>
			{@render idField()}
			<Button
				type="submit"
				variant={askLeads ? 'outline' : 'default'}
				disabled={disabled || (busy && actions.pending !== 'resendSetup')}
				aria-disabled={actions.pending === 'resendSetup' ? 'true' : undefined}
				aria-busy={actions.pending === 'resendSetup' || undefined}
			>
				{#if actions.pending === 'resendSetup'}<Spinner />{/if}
				Resend setup link
			</Button>
		</form>
		<form
			bind:this={rescindForm}
			method="POST"
			action="?/rescindAccess"
			use:enhance={run('rescindAccess')}
			class="sm:ml-auto"
		>
			{@render idField()}
			<Button
				type="button"
				variant="ghost-destructive"
				disabled={disabled || busy}
				onclick={() => (confirmingRescind = true)}
			>
				Rescind access
			</Button>
		</form>
	</div>
</div>

{#if confirmingRescind}
	<ConfirmDialog
		title="Rescind access?"
		message={`${name}'s approval and setup link are withdrawn. They cannot set up an account unless they ask for access again.`}
		confirmLabel="Rescind access"
		loading={actions.pending === 'rescindAccess'}
		onConfirm={() => rescindForm?.requestSubmit()}
		onCancel={() => (confirmingRescind = false)}
	/>
{/if}
