<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { form, data } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const initialInviteCode = $derived(form?.inviteCode ?? data.inviteCode ?? '');
	const initialEmail = $derived(form?.email ?? data.email ?? '');
</script>

<svelte:head>
	<title>Create Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Organization Invite"
	title="Create your account from an invite."
	description="Use the invite code from an organization invite to create your account and join that organization."
	panelEyebrow="New account"
	panelTitle={form?.confirmEmail ? 'Check your email' : 'Create your account'}
	panelDescription={form?.confirmEmail
		? 'One more step remains before you can sign in.'
		: 'Enter the invite code you received and choose a password that meets policy.'}
	supportLabel="Joining an organization"
	supportTitle="This page is for invited users."
	supportDescription="If an organization invited you by email, use the invite code from that email to create your account."
	supportPoints={[
		'Your account will be linked to the organization that invited you.',
		'Use the same email address the invite was sent to.',
		'If you already have an account, sign in instead of creating a new one.'
	]}
>
	<div class="auth-stack">
		{#if form?.confirmEmail}
			<AuthNotice tone="success" title="Confirm your email" centered>
				<p>We sent a confirmation link to <strong>{form.email}</strong>.</p>
				<p>Open that message, confirm the account, then return here to sign in.</p>
			</AuthNotice>

			<div class="auth-actions">
				<a href="/auth/login" class="btn btn-primary">Back to sign in</a>
				<a href="/auth/register" class="btn btn-secondary">Start over</a>
			</div>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

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
					label="Invite Code"
					id="inviteCode"
					name="inviteCode"
					value={initialInviteCode}
					required
					placeholder="Enter your invite code"
					hint="Registration is by invitation only."
				/>

				<FormField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={initialEmail}
					required
					placeholder="you@example.com"
				/>

				<FormField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					required
					placeholder="At least 12 characters"
					hint="Use at least 12 characters with uppercase, lowercase, and a number."
				>
					{#snippet action()}
						<button
							type="button"
							class="field-action"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
							{/if}
						</button>
					{/snippet}
				</FormField>

				<FormField
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					required
					placeholder="Re-enter your password"
				>
					{#snippet action()}
						<button
							type="button"
							class="field-action"
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
							aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
						>
							{#if showConfirmPassword}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
							{/if}
						</button>
					{/snippet}
				</FormField>

				<div class="auth-checkbox">
					<label class="checkbox-label">
						<input type="checkbox" name="agreeTerms" required />
						<span>
							I have read and agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a> and
							<a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
						</span>
					</label>
				</div>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Creating Account...
						{:else}
							Create Account
						{/if}
					</button>
				</div>
			</form>

			<div class="auth-divider">
				<span>Already registered?</span>
			</div>

			<div class="auth-link-list">
				<p>
					Already have an account? <a href="/auth/login">Sign in</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
