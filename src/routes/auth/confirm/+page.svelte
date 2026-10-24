<script lang="ts">
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import AuthButton from '$features/identity/AuthButton.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let loading = $state(false);
	let submitError = $state('');

	const validConfirmation = $derived(data.confirmation.status === 'valid' ? data.confirmation : null);
	const confirmationTitle = $derived(
		validConfirmation
			? validConfirmation.type === 'email' || validConfirmation.type === 'signup'
				? 'Confirm your account'
				: validConfirmation.type === 'invite'
					? 'Confirm your invite'
					: 'Confirm your password reset'
			: 'Link unavailable'
	);
	const confirmationDescription = $derived(
		validConfirmation
			? validConfirmation.type === 'email' || validConfirmation.type === 'signup'
				? 'Continue to organization setup.'
				: validConfirmation.type === 'invite'
					? 'Continue into the invite setup flow.'
					: 'Continue into the password reset flow.'
			: 'This email link can no longer be used.'
	);
	const submitLabel = $derived(
		validConfirmation
			? validConfirmation.type === 'email' || validConfirmation.type === 'signup'
				? 'Confirm Account'
				: validConfirmation.type === 'invite'
					? 'Continue to Invite Setup'
					: 'Continue to Password Reset'
			: ''
	);
</script>

<svelte:head>
	<title>Confirm Email Link - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Email Confirmation"
	headline={['One click.', 'Confirmed.']}
	lede="The link stays passive until you press the button, so a mail scanner can't use it up first."
	steps={{
		label: 'Where this link goes',
		items: [
			{ title: 'Account links', detail: 'Confirm your email, then set up.' },
			{ title: 'Invite links', detail: 'Continue to your first password.' },
			{ title: 'Reset links', detail: 'Continue to a new password.' }
		]
	}}
	alternatives={validConfirmation
		? []
		: [
				{ prompt: 'Waiting on approval?', label: 'Request access', href: resolve('/auth/request-access') },
				{ prompt: 'Forgot your password?', label: 'Reset your password', href: resolve('/auth/forgot-password') },
				{ prompt: 'Invite expired?', label: 'Renew your invite', href: resolve('/auth/renew-invite') }
			]}
	panelEyebrow="Auth confirmation"
	panelTitle={confirmationTitle}
	panelDescription={confirmationDescription}
>
	<div class="flex flex-col gap-5">
		{#if validConfirmation}
			<AuthNotice tone="info" title={confirmationTitle}>
				<p>
					Select <strong>{submitLabel}</strong> to verify this email link and continue.
				</p>
			</AuthNotice>
			{#if submitError}
				<AuthNotice tone="error" message={submitError} />
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					submitError = '';
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'failure') {
							submitError =
								typeof result.data?.error === 'string'
									? result.data.error
									: 'Unable to verify this email link. Please try again.';
							return;
						}
						await update();
					};
				}}
				class="flex flex-col gap-5"
			>
				<input type="hidden" name="tokenHash" value={validConfirmation.tokenHash} />
				<input type="hidden" name="type" value={validConfirmation.type} />
				<input type="hidden" name="next" value={validConfirmation.next} />

				<AuthButton {loading} loadingLabel="Confirming...">{submitLabel}</AuthButton>
			</form>
		{:else}
			<AuthNotice tone="error" title="Link unavailable" centered>
				<p>This email link is invalid or has expired.</p>
				<p>Request access, renew your invite, or request a fresh password reset email.</p>
			</AuthNotice>

			<AuthButton href={resolve('/auth/login')}>Back to Sign In</AuthButton>
		{/if}
	</div>
</AuthShell>
