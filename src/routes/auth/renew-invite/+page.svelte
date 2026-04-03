<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { data, form } = $props();
	let loading = $state(false);

	const emailValue = $derived(form?.email ?? data.email ?? '');
</script>

<svelte:head>
	<title>Renew Invite - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Invite Recovery"
	title="Need a fresh invite link?"
	description="If your original setup email expired, we can send a new one for any approved request that still has not been completed."
	panelEyebrow="Renew invite"
	panelTitle={form?.success ? 'Check your email' : 'Request a fresh invite link'}
	panelDescription={form?.success
		? 'If your request is still eligible, a new setup email is on the way.'
		: 'Enter the same email address you used on your access request.'}
	supportLabel="Before you send it"
	supportTitle="This only works for approved requests."
	supportDescription="For security, we only resend setup emails for approved access requests that have not already been finished."
	supportPoints={[
		'Use the same email address that received the original invite.',
		'Fresh invite links expire after 24 hours, so open the next email soon.',
		'If your account is already set up, use reset password instead.'
	]}
>
	<div class="auth-stack">
		{#if form?.success}
			<AuthNotice tone="success" title="Check your email" centered>
				<p>
					If <strong>{form.email}</strong> still has an approved, incomplete request, a fresh setup email is on the way.
				</p>
				<p>For security, that new link will expire after 24 hours.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

			<AuthNotice tone="warning" title="24-hour security window">
				<p>Approved invite links only stay valid for 24 hours.</p>
				<p>If you receive a new one, open it promptly so it does not expire again.</p>
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
				<FormField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={emailValue}
					required
					placeholder="you@example.com"
				/>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Sending Fresh Invite...
						{:else}
							Email Me a Fresh Invite
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="auth-divider">
			<span>Need a different route?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Already set up? <a href="/auth/login">Sign in</a>.
			</p>
			<p>
				Account active but password forgotten? <a href="/auth/forgot-password">Reset your password</a>.
			</p>
			<p>
				Still waiting on approval? <a href="/auth/request-access">Request access</a>.
			</p>
		</div>
	</div>
</AuthShell>
