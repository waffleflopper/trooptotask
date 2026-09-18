<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { onMount } from 'svelte';
	import { establishSession, readSessionTokens, type SessionTokens } from '$lib/auth/establishSession';

	const hasSession = $derived($page.data.hasSession);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);
	let tokenError = $state(false);
	let sessionError = $state(false);
	let establishingSession = $state(false);
	let tokens: SessionTokens | null = null;
	let statusError = $state(false);
	let checkingStatus = $state(false);
	let requiresMfa = $state(false);
	let mfaCode = $state('');
	let mfaVerified = $state(false);
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

	async function loadMfaStatus() {
		if (checkingStatus) return;
		checkingStatus = true;
		try {
			const response = await fetch('/api/auth/mfa/status');
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const payload = await response.json();
			if (
				!response.ok ||
				!payload ||
				payload.error ||
				!['aal1', 'aal2'].includes(payload.currentLevel) ||
				!['aal1', 'aal2'].includes(payload.nextLevel)
			) {
				statusError = true;
				return;
			}

			requiresMfa = payload.currentLevel === 'aal1' && payload.nextLevel === 'aal2';
			mfaVerified = !requiresMfa;
			statusError = false;
			sessionReady = true;
		} catch {
			statusError = true;
		} finally {
			checkingStatus = false;
		}
	}

	function handleMfaCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		mfaCode = input.value.replace(/\D/g, '').slice(0, 6);
	}

	async function verifySession() {
		if (!tokens || establishingSession) return;
		establishingSession = true;
		try {
			const result = await establishSession(tokens, 'recovery');
			if (result === 'ready') {
				sessionError = false;
				tokens = null;
				replaceState(resolve('/auth/reset-password'), $page.state);
				await loadMfaStatus();
			} else {
				tokenError = result === 'invalid';
				sessionError = result === 'unavailable';
			}
		} finally {
			establishingSession = false;
		}
	}

	onMount(() => {
		// An incoming link takes precedence over an existing account's session.
		if (window.location.hash) {
			tokens = readSessionTokens(window.location.hash);
			if (tokens) void verifySession();
			else tokenError = true;
		} else if (hasSession) {
			void loadMfaStatus();
		} else {
			tokenError = true;
		}
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
			const updateResponse = await fetch('/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					password
				})
			});

			const updateResult = await readJsonResult(updateResponse);
			if (!updateResult.ok) {
				error = updateResult.error ?? 'Failed to update password.';
				return;
			}

			success = true;
			setTimeout(() => goto(resolve('/auth/login')), 3000);
		} finally {
			loading = false;
		}
	}

	async function handleMfaVerify(e: Event) {
		e.preventDefault();
		if (loading) return;
		error = '';

		if (mfaCode.length !== 6) {
			error = 'Please enter the 6-digit code from your authenticator app.';
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: mfaCode })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}

			const result = await readJsonResult(response);
			if (!result.ok) {
				error = result.error ?? 'Verification failed.';
				return;
			}

			requiresMfa = false;
			mfaVerified = true;
			mfaCode = '';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Verification failed.';
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
			: statusError
				? 'Security check unavailable'
				: sessionReady && requiresMfa
					? 'Verify your authenticator'
					: sessionReady
						? 'Choose a new password'
						: 'Verifying reset link'}
	panelDescription={success
		? "You'll be redirected to sign in shortly."
		: tokenError
			? 'This reset link can no longer be used.'
			: statusError
				? 'Retry the security check to continue your password reset.'
				: sessionReady && requiresMfa
					? 'Enter the current 6-digit code from your authenticator app before setting a new password.'
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
	<div class="flex flex-col gap-5">
		{#if success}
			<AuthNotice tone="success" title="Password updated" centered>
				<p>Your password has been reset successfully.</p>
				<p>Redirecting you to sign in now.</p>
			</AuthNotice>
		{:else if sessionError}
			<AuthNotice tone="error" message="We could not verify this session. Please try again." />
			<Button type="button" onclick={verifySession} disabled={establishingSession} class="w-full">
				{#if establishingSession}<Spinner />Verifying session...{:else}Retry verification{/if}
			</Button>
		{:else if tokenError}
			<AuthNotice tone="error" title="Reset link unavailable" centered>
				<p>This reset link is invalid or has expired.</p>
			</AuthNotice>
		{:else if statusError}
			<AuthNotice tone="error" message="We could not verify your account security settings. Please try again." />
			<Button type="button" onclick={loadMfaStatus} disabled={checkingStatus} class="w-full">
				{#if checkingStatus}<Spinner />Checking security...{:else}Retry security check{/if}
			</Button>
		{:else if !sessionReady}
			<div class="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
				<Spinner class="text-primary" />
				<p class="m-0 text-sm leading-relaxed">Verifying reset link...</p>
			</div>
		{:else if requiresMfa && !mfaVerified}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleMfaVerify} class="flex flex-col gap-5">
				<AuthField
					label="Authenticator Code"
					id="mfa-code"
					disabled={loading}
					hint="Enter the current 6-digit code from your authenticator app before you reset the password."
					value={mfaCode}
					oninput={handleMfaCodeInput}
					placeholder="000000"
					maxlength={6}
					autocomplete="one-time-code"
					inputmode="numeric"
					inputClass="px-[calc(0.625rem+0.35em)] text-center font-mono text-2xl tracking-[0.35em]"
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading || mfaCode.length !== 6} class="w-full">
						{#if loading}
							<Spinner />
							Verifying...
						{:else}
							Verify Code
						{/if}
					</Button>
				</div>
			</form>
		{:else}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleSubmit} class="flex flex-col gap-5">
				<AuthField
					label="New Password"
					id="password"
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					required
					placeholder="At least 12 characters"
					hint="Use at least 12 characters with uppercase, lowercase, and a number."
				>
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>

				<ul class="grid gap-2 text-xs leading-normal text-muted-foreground" aria-live="polite">
					<li class={hasMinLength ? 'text-success' : undefined}>At least 12 characters</li>
					<li class={hasUppercase ? 'text-success' : undefined}>One uppercase letter</li>
					<li class={hasLowercase ? 'text-success' : undefined}>One lowercase letter</li>
					<li class={hasDigit ? 'text-success' : undefined}>One number</li>
				</ul>

				<AuthField
					label="Confirm New Password"
					id="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					placeholder="Re-enter your password"
					hint={passwordsMatch ? 'Passwords match.' : undefined}
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={!canSubmit} class="w-full">
						{#if loading}
							<Spinner />
							Updating Password...
						{:else}
							Update Password
						{/if}
					</Button>
				</div>
			</form>
		{/if}

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Need to exit?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<div>
				Stop this recovery session and
				<form method="POST" action={resolve('/auth/logout')} class="inline">
					<button type="submit" class="font-medium underline-offset-4 hover:text-foreground hover:underline">
						sign out
					</button>
				</form>
				.
			</div>
		</div>
	</div>
</AuthShell>
