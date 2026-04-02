<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Forgot Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	title="Recover access without hunting through settings."
	description="Password reset should be one short detour, not a second workflow to learn."
	panelEyebrow="Recovery"
	panelTitle={form?.success ? 'Check your email' : 'Reset your password'}
	panelDescription={form?.success
		? 'A reset link is on the way.'
		: "Enter the email address tied to your account and we'll send a reset link."}
	supportLabel="What happens next"
	supportTitle="Check your email."
	supportDescription="If the account exists, you'll receive a password reset link at that address."
	supportPoints={[
		'Use the same email address you use to sign in.',
		'Open the reset link from your email to choose a new password.',
		'After resetting, return here and sign in normally.'
	]}
>
	<div class="auth-stack">
		{#if form?.success}
			<AuthNotice tone="success" title="Check your email" centered>
				<p>We sent a password reset link to <strong>{form.email}</strong>.</p>
				<p>Open the message and follow the link to choose a new password.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

			<p class="auth-note">
				Use the same email address you normally sign in with. If the account exists, you'll receive a reset link.
			</p>

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
					value={form?.email ?? ''}
					required
					placeholder="you@example.com"
				/>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Sending Reset Link...
						{:else}
							Send Reset Link
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="auth-divider">
			<span>Remembered it?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Back to <a href="/auth/login">sign in</a>.
			</p>
		</div>
	</div>
</AuthShell>
