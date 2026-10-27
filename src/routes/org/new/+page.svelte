<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { settleAction } from '$lib/utils/settleAction';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	// A no-JS failure re-renders with the submitted name; with JS, later edits must survive a delayed failure.
	let nameDraft = $state(untrack(() => form?.name ?? ''));
	let createButton = $state<HTMLElement | null>(null);
	let unexpectedError = $state<string | null>(null);
	// A new submission supersedes the failure on screen; only a failure the server returns for it shows again.
	let supersededForm = $state.raw<ActionData | undefined>(undefined);
	const failure = $derived(form === supersededForm ? undefined : form?.error);
	let active = true;
	onDestroy(() => {
		active = false;
	});
	// Only a 400 rejects the name itself; other failures belong to the request.
	const nameError = $derived(page.status === 400 && failure ? failure : '');
	const requestError = $derived(unexpectedError ?? (failure && !nameError ? failure : ''));
</script>

<svelte:head>
	<title>Create Your Organization - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="New Organization"
	headline={['Stand up', 'your unit.']}
	lede="Name it here. Setup takes it from there, one step at a time, and you can skip any step."
	outline={{
		label: 'What happens next',
		items: [
			{ title: 'Name your Organization', tag: 'Now' },
			{ title: 'Set up Groups, ranks, your roster and features' },
			{ title: 'Invite your team' }
		]
	}}
	signedIn={{}}
	panelEyebrow={data.userEmail ? `Signed in as ${data.userEmail}` : 'New Organization'}
	panelTitle="Create Organization"
	panelDescription="The unit everyone will work in. You become its owner and can invite your team once it's set up."
	alternatives={[
		{ prompt: 'Expecting an invitation?', label: 'Check your invitations', href: `${resolve('/dashboard')}?show=all` }
	]}
>
	<form
		method="POST"
		class="flex flex-col gap-8"
		use:enhance={({ cancel }) => {
			if (loading) return cancel();
			loading = true;
			unexpectedError = null;
			supersededForm = form;
			return async (outcome) => {
				await settleAction(outcome, {
					isCurrent: () => active,
					settled: (error) => {
						unexpectedError = error;
						loading = false;
					},
					focus: () => [nameError ? document.getElementById('name') : null, createButton]
				});
			};
		}}
	>
		<input type="hidden" name="requestId" value={form?.requestId ?? data.requestId} />

		<div class="flex flex-col gap-5">
			{#if !data.emailConfirmed}
				{#if data.emailConfirmationUnavailable}
					<AuthNotice tone="warning" message={data.emailConfirmationMessage} />
				{:else}
					<AuthNotice
						tone="warning"
						title="Confirm your email first"
						message={`Open the newest email we sent${data.userEmail ? ` to ${data.userEmail}` : ''}, then come back to this page.`}
					/>
				{/if}
			{/if}

			{#if requestError}
				<AuthNotice tone="error" message={requestError} />
			{/if}

			<AuthField
				label="Organization name"
				id="name"
				name="name"
				bind:value={nameDraft}
				required
				autocomplete="off"
				disabled={!data.emailConfirmed}
				error={nameError || undefined}
				hint="Use the name your Soldiers know. You can change it later in Unit settings."
			/>
		</div>

		<AuthButton
			bind:ref={createButton}
			disabled={!data.emailConfirmed}
			{loading}
			holdFocus
			loadingLabel={nameDraft.trim() ? `Creating ${nameDraft.trim()}` : 'Creating...'}
		>
			Create and start setup
		</AuthButton>
	</form>
</AuthShell>
