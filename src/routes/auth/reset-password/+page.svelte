<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onMount } from 'svelte';

	const supabase = $derived($page.data.supabase);
	const hasSession = $derived($page.data.hasSession);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);
	let tokenError = $state(false);

	let authSubscription: { unsubscribe: () => void } | null = null;

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

	onMount(() => {
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event: string) => {
			if (event === 'PASSWORD_RECOVERY') {
				sessionReady = true;
				tokenError = false;
			}
		});
		authSubscription = subscription;

		void (async () => {
			if (hasSession) {
				sessionReady = true;
			}

			if (!sessionReady) {
				const hash = window.location.hash.substring(1);
				if (hash) {
					const params = new URLSearchParams(hash);
					const accessToken = params.get('access_token');
					const refreshToken = params.get('refresh_token');

					if (accessToken && refreshToken) {
						const { error: sessionError } = await supabase.auth.setSession({
							access_token: accessToken,
							refresh_token: refreshToken
						});

						if (!sessionError) {
							sessionReady = true;
							window.history.replaceState(null, '', window.location.pathname);
						}
					}
				}
			}

			if (!sessionReady) {
				const { data } = await supabase.auth.getSession();
				if (data.session) {
					sessionReady = true;
				}
			}

			if (!sessionReady) {
				tokenError = true;
			}
		})();

		return () => authSubscription?.unsubscribe();
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
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
			const { error: updateError } = await supabase.auth.updateUser({ password });

			if (updateError) {
				error = updateError.message;
				return;
			}

			try {
				await fetch('/api/auth/complete-access-request', { method: 'POST' });
			} catch (completionError) {
				console.error('Failed to mark access request complete after password reset:', completionError);
			}

			success = true;
			setTimeout(() => goto('/auth/login'), 3000);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	title="Set a new password and move on."
	description="Once the recovery link is verified, this screen should be the last stop before you're back inside the platform."
	panelEyebrow="Password reset"
	panelTitle={success
		? 'Password updated'
		: tokenError
			? 'Reset link unavailable'
			: sessionReady
				? 'Choose a new password'
				: 'Verifying reset link'}
	panelDescription={success
		? "You'll be redirected to sign in shortly."
		: tokenError
			? 'This reset link can no longer be used.'
			: sessionReady
				? 'Enter the new password you want to use for future sign-ins.'
				: "We're confirming the recovery session before allowing a password change."}
	supportLabel="Reset session"
	supportTitle="Use the link, then set the password."
	supportDescription="You can only change the password here after the reset link has been verified."
	supportPoints={[
		'Choose the new password you want to use going forward.',
		'If the link is no longer valid, request a new reset email.',
		'After updating the password, sign in normally.'
	]}
>
	<div class="auth-stack">
		{#if success}
			<AuthNotice tone="success" title="Password updated" centered>
				<p>Your password has been reset successfully.</p>
				<p>Redirecting you to sign in now.</p>
			</AuthNotice>
		{:else if tokenError}
			<AuthNotice tone="error" title="Reset link unavailable" centered>
				<p>This reset link is invalid or has expired.</p>
			</AuthNotice>
		{:else if !sessionReady}
			<div class="auth-loading">
				<Spinner color="var(--amber)" />
				<p class="auth-note">Verifying reset link...</p>
			</div>
		{:else}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleSubmit} class="auth-stack">
				<FormField
					label="New Password"
					id="password"
					type="password"
					bind:value={password}
					required
					placeholder="At least 12 characters"
					hint="Use at least 12 characters with uppercase, lowercase, and a number."
				/>

				<ul class="auth-password-checklist" aria-live="polite">
					<li class:is-met={hasMinLength}>At least 12 characters</li>
					<li class:is-met={hasUppercase}>One uppercase letter</li>
					<li class:is-met={hasLowercase}>One lowercase letter</li>
					<li class:is-met={hasDigit}>One number</li>
				</ul>

				<FormField
					label="Confirm New Password"
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					placeholder="Re-enter your password"
					hint={passwordsMatch ? 'Passwords match.' : undefined}
				/>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={!canSubmit}>
						{#if loading}
							<Spinner />
							Updating Password...
						{:else}
							Update Password
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="auth-divider">
			<span>Need a different path?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Back to <a href="/auth/login">sign in</a>.
			</p>
		</div>
	</div>
</AuthShell>
