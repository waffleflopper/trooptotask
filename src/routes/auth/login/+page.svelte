<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { form, data } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
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
	supportLabel="Need help?"
	supportTitle="Choose the right path."
	supportDescription="If you do not have an account yet, create one from an invite or request beta access."
	supportPoints={[
		'If you have an account but cannot sign in, reset your password before requesting new access.',
		'Invite codes expire. If yours is stale, ask your unit admin to resend the invite.',
		'Request Access is only for units that do not yet have access to TroopToTask.'
	]}
>
	<div class="auth-stack">
		{#if data.authLinkError}
			<AuthNotice tone="error" message={data.authLinkError} />
		{/if}

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
					type={showPassword ? 'text' : 'password'}
					class="input"
					data-testid="login-password"
					required
					autocomplete="current-password"
					placeholder="Enter your password"
				/>
				<button
					type="button"
					class="field-action"
					onclick={() => (showPassword = !showPassword)}
					aria-label={showPassword ? 'Hide password' : 'Show password'}
				>
					{#if showPassword}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
							><path
								d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
							/><line x1="1" y1="1" x2="23" y2="23" /></svg
						>
					{:else}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
							><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg
						>
					{/if}
				</button>
			</FormField>

			<p class="auth-muted">
				Forgot your password? <a href="/auth/forgot-password">Reset it here</a>.
			</p>

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
