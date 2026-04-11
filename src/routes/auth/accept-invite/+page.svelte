<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onMount } from 'svelte';

	const hasSession = $derived($page.data.hasSession);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);
	let tokenError = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const hasMinLength = $derived(password.length >= 12);
	const hasUppercase = $derived(/[A-Z]/.test(password));
	const hasLowercase = $derived(/[a-z]/.test(password));
	const hasDigit = $derived(/\d/.test(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const canSubmit = $derived(hasMinLength && hasUppercase && hasLowercase && hasDigit && passwordsMatch && !loading);

	function getPasswordError(value: string): string | null {
		if (!value || value.length < 12) {
			return 'Password must be at least 12 characters';
		}
		if (value.length > 128) {
			return 'Password must be 128 characters or fewer';
		}
		if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
			return 'Password must include uppercase, lowercase, and a number';
		}
		return null;
	}

	async function readJsonResult(response: Response): Promise<{ ok: boolean; error?: string }> {
		try {
			const payload = (await response.json()) as { ok?: boolean; error?: string };
			return {
				ok: response.ok && payload.ok === true,
				error: payload.error
			};
		} catch {
			return { ok: false };
		}
	}

	onMount(async () => {
		if (hasSession) {
			sessionReady = true;
			return;
		}

		const hash = window.location.hash.substring(1);
		if (hash) {
			const params = new URLSearchParams(hash);
			const accessToken = params.get('access_token');
			const refreshToken = params.get('refresh_token');

			if (accessToken && refreshToken) {
				const response = await fetch('/api/auth/establish-session', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						accessToken,
						refreshToken,
						flow: 'invite'
					})
				});

				const result = await readJsonResult(response);
				if (result.ok) {
					sessionReady = true;
					window.history.replaceState(null, '', window.location.pathname);
					return;
				}
				error = result.error ?? 'We could not verify your invite session. Please try the invite link again.';
			}
		}

		tokenError = true;
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';

		const passwordError = getPasswordError(password);
		if (passwordError) {
			error = passwordError;
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		try {
			const updateResponse = await fetch('/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const updateResult = await readJsonResult(updateResponse);
			if (!updateResult.ok) {
				error = updateResult.error || 'Failed to set password. Please try again.';
				return;
			}

			const finalizeResponse = await fetch('/api/auth/finalize-invite', { method: 'POST' });
			const finalizeResult = await readJsonResult(finalizeResponse);
			if (!finalizeResult.ok) {
				let message =
					'Your password was set, but we could not finish account activation. Please try the invite link again or contact support.';
				if (finalizeResult.error) {
					message = finalizeResult.error;
				}
				error = message;
				return;
			}

			success = true;
			setTimeout(() => goto('/dashboard'), 2000);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Accept Invite - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Organization Invite"
	title="Activate the account behind your invite."
	description="Open this page from your invite email, set a password, and your account will be ready to use."
	panelEyebrow="Invite acceptance"
	panelTitle={success
		? 'Account activated'
		: tokenError
			? 'Invite unavailable'
			: sessionReady
				? 'Set your password'
				: 'Verifying invite link'}
	panelDescription={success
		? 'Redirecting you to your dashboard.'
		: tokenError
			? 'This invite link can no longer be used.'
			: sessionReady
				? 'Choose a password that satisfies the current invite policy.'
				: "We're validating the invite token before exposing the activation form."}
	supportLabel="Joining an organization"
	supportTitle="Finish the invite."
	supportDescription="This page is for invited users who are setting their password for the first time."
	supportPoints={[
		'The invite link must still be valid and only lasts 24 hours.',
		'Set the password you want to use for future sign-ins.',
		'After this step, sign in with your email and password as usual.'
	]}
>
	<div class="auth-stack">
		{#if success}
			<AuthNotice tone="success" title="Account activated" centered>
				<p>Your password has been set successfully.</p>
				<p>Redirecting you to the dashboard now.</p>
			</AuthNotice>
		{:else if tokenError}
			<AuthNotice tone="error" title="Invite unavailable" centered>
				<p>This invite link is invalid or has expired.</p>
				<p><a href="/auth/renew-invite">Need a fresh invite? Renew it here.</a></p>
			</AuthNotice>
		{:else if !sessionReady}
			<div class="auth-loading">
				<Spinner color="var(--amber)" />
				<p class="auth-note">Verifying invite link...</p>
			</div>
		{:else}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleSubmit} class="auth-stack">
				<FormField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					required
					placeholder="At least 12 characters"
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

				<ul class="auth-password-checklist" aria-live="polite">
					<li class:is-met={hasMinLength}>At least 12 characters</li>
					<li class:is-met={hasUppercase}>One uppercase letter</li>
					<li class:is-met={hasLowercase}>One lowercase letter</li>
					<li class:is-met={hasDigit}>One number</li>
				</ul>

				<FormField
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					placeholder="Re-enter your password"
					hint={passwordsMatch ? 'Passwords match.' : undefined}
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

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={!canSubmit}>
						{#if loading}
							<Spinner />
							Setting Password...
						{:else}
							Set Password
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="auth-divider">
			<span>Need to exit?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Leave this invite flow and <a href="/auth/logout">sign out</a>.
			</p>
		</div>
	</div>
</AuthShell>
