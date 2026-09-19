<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data } = $props();

	let loading = $state(false);

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
	title="Review the email link before continuing."
	description="This extra step keeps the verification request on your terms instead of letting a mail scanner or link prefetcher consume it first."
	panelEyebrow="Auth confirmation"
	panelTitle={confirmationTitle}
	panelDescription={confirmationDescription}
	supportLabel="Why there is a button"
	supportTitle="Open the page, then confirm."
	supportDescription="The link stays passive until you press the button on this page."
	supportPoints={[
		'Signup links confirm control of your email before organization setup.',
		'Invite links continue to the first-time password setup flow.',
		'Password reset links continue to the password change flow.',
		'If the link has expired, request a fresh email and try again.'
	]}
>
	<div class="flex flex-col gap-5">
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
				class="flex flex-col gap-5"
			>
				<input type="hidden" name="tokenHash" value={validConfirmation.tokenHash} />
				<input type="hidden" name="type" value={validConfirmation.type} />
				<input type="hidden" name="next" value={validConfirmation.next} />

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Confirming...
						{:else}
							{submitLabel}
						{/if}
					</Button>
				</div>
			</form>
		{:else}
			<AuthNotice tone="error" title="Link unavailable" centered>
				<p>This email link is invalid or has expired.</p>
				<p>Request access, renew your invite, or request a fresh password reset email.</p>
			</AuthNotice>

			<div class="flex flex-col gap-3">
				<Button href="/auth/login" class="w-full">Back to Sign In</Button>
				<Button href="/auth/request-access" variant="outline" class="w-full">Request Access</Button>
				<Button href="/auth/forgot-password" variant="outline" class="w-full">Reset Password</Button>
				<Button href="/auth/renew-invite" variant="outline" class="w-full">Renew Invite</Button>
			</div>
		{/if}
	</div>
</AuthShell>
