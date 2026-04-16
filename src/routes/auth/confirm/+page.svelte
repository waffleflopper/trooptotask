<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { data } = $props();

	let loading = $state(false);

	const validConfirmation = $derived(data.confirmation.status === 'valid' ? data.confirmation : null);
	const confirmationTitle = $derived(
		validConfirmation
			? validConfirmation.type === 'invite'
				? 'Confirm your invite'
				: 'Confirm your password reset'
			: 'Link unavailable'
	);
	const confirmationDescription = $derived(
		validConfirmation
			? validConfirmation.type === 'invite'
				? 'Continue into the invite setup flow.'
				: 'Continue into the password reset flow.'
			: 'This email link can no longer be used.'
	);
	const submitLabel = $derived(
		validConfirmation
			? validConfirmation.type === 'invite'
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
	title="Review the email link before continuing."
	description="This extra step keeps the verification request on your terms instead of letting a mail scanner or link prefetcher consume it first."
	panelEyebrow="Auth confirmation"
	panelTitle={confirmationTitle}
	panelDescription={confirmationDescription}
	supportLabel="Why there is a button"
	supportTitle="Open the page, then confirm."
	supportDescription="The link stays passive until you press the button on this page."
	supportPoints={[
		'Invite links continue to the first-time password setup flow.',
		'Password reset links continue to the password change flow.',
		'If the link has expired, request a fresh email and try again.'
	]}
>
	<div class="auth-stack">
		{#if validConfirmation}
			<AuthNotice tone="info" title={confirmationTitle}>
				<p>
					Select <strong>{submitLabel}</strong> to verify this email link and continue.
				</p>
			</AuthNotice>

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="auth-stack"
			>
				<input type="hidden" name="tokenHash" value={validConfirmation.tokenHash} />
				<input type="hidden" name="type" value={validConfirmation.type} />
				<input type="hidden" name="next" value={validConfirmation.next} />

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Confirming...
						{:else}
							{submitLabel}
						{/if}
					</button>
				</div>
			</form>
		{:else}
			<AuthNotice tone="error" title="Link unavailable" centered>
				<p>This email link is invalid or has expired.</p>
				<p>Request a fresh invite or password reset email, then try again.</p>
			</AuthNotice>

			<div class="auth-actions">
				<a href="/auth/login" class="btn btn-primary">Back to Sign In</a>
				<a href="/auth/forgot-password" class="btn btn-secondary">Reset Password</a>
				<a href="/auth/renew-invite" class="btn btn-secondary">Renew Invite</a>
			</div>
		{/if}
	</div>
</AuthShell>
