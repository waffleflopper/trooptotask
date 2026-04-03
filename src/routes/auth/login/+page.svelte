<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { form, data } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Sign In - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Account Access"
	title="Sign in to your account."
	description="Use the email address and password tied to your TroopToTask account."
	panelEyebrow="Existing account"
	panelTitle="Sign in"
	panelDescription="Use the email and password tied to your organization access."
	supportLabel="Need help?"
	supportTitle="Choose the right path."
	supportDescription="If you do not have an account yet, create one from an invite or request beta access."
	supportPoints={[
		'Use Reset Password if you already have an account but cannot sign in.',
		'Use Create Account if you already have an invite code.',
		'Use Request Access only if you want beta access and have not been invited yet.'
	]}
>
	<div class="auth-stack">
		{#if form?.error}
			<AuthNotice tone="error" message={form.error} />
		{/if}

		<form
			method="POST"
			action="?/login"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="auth-stack"
		>
			<FormField label="Email Address" id="email">
				<input
					id="email"
					name="email"
					type="email"
					class="input"
					data-testid="login-email"
					value={form?.email ?? ''}
					required
					autocomplete="email"
					placeholder="you@example.com"
				/>
			</FormField>

			<FormField label="Password" id="password">
				<input
					id="password"
					name="password"
					type="password"
					class="input"
					data-testid="login-password"
					required
					autocomplete="current-password"
					placeholder="Enter your password"
				/>
			</FormField>

			<div class="auth-actions">
				<button type="submit" class="btn btn-primary" data-testid="login-submit" disabled={loading}>
					{#if loading}
						<Spinner />
						Signing In...
					{:else}
						Sign In
					{/if}
				</button>
			</div>
		</form>

		<p class="auth-muted">
			Forgot your password? <a href="/auth/forgot-password">Reset it here</a>.
		</p>

		{#if data.demoError}
			<AuthNotice tone="warning" message={data.demoError} />
		{/if}

		<div class="auth-divider">
			<span>Need access?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Have an invite code? <a href="/auth/register">Create your account</a>.
			</p>
			<p>
				Want beta access? <a href="/auth/request-access">Request access</a>.
			</p>
		</div>
	</div>
</AuthShell>
