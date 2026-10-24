<script lang="ts">
	import {
		PasswordCompletion,
		PasswordMfaChallenge,
		passwordRequirements,
		hasPendingPasswordCompletion,
		reconciledPasswordState,
		PASSWORD_MISMATCH_MESSAGE,
		validatePassword
	} from '$features/identity';
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthPasswordToggle from '$features/identity/AuthPasswordToggle.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import type { PasswordCompletionState } from '$features/identity/contracts';
	let completion = $state<PasswordCompletionState>(null);
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { Spinner } from '$lib/components/ui/spinner';
	import { onDestroy, onMount, tick } from 'svelte';
	import type { MfaStatus } from '$features/identity/contracts';

	const hasSession = $derived($page.data.hasSession);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);
	let tokenError = $state(false);
	let statusError = $state(false);
	let checkingStatus = $state(false);
	let requiresMfa = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let navigationTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(navigationTimer));

	const requirements = $derived(passwordRequirements(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const confirmError = $derived(confirmPassword && !passwordsMatch ? PASSWORD_MISMATCH_MESSAGE : undefined);
	const canSubmit = $derived(requirements.valid && passwordsMatch && !loading);

	async function readJsonResult(
		response: Response
	): Promise<{ ok: boolean; error?: string; code?: string; state?: unknown; passwordUpdated?: boolean }> {
		try {
			const payload = (await response.json()) as {
				ok?: boolean;
				error?: string;
				code?: string;
				state?: unknown;
				passwordUpdated?: boolean;
			};
			return {
				ok: response.ok && payload?.ok === true && payload.error === undefined,
				error: typeof payload?.error === 'string' ? payload.error : undefined,
				code: typeof payload?.code === 'string' ? payload.code : undefined,
				state: payload?.state,
				passwordUpdated: payload?.passwordUpdated === true
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
			const payload = (await response.json()) as (Partial<MfaStatus> & { error?: unknown }) | null;
			if (
				!response.ok ||
				!payload ||
				payload.error ||
				!['aal1', 'aal2'].includes(payload.currentLevel ?? '') ||
				!['aal1', 'aal2'].includes(payload.nextLevel ?? '')
			) {
				statusError = true;
				return;
			}

			requiresMfa = payload.currentLevel === 'aal1' && payload.nextLevel === 'aal2';
			statusError = false;
			sessionReady = true;
		} catch {
			statusError = true;
		} finally {
			checkingStatus = false;
		}
	}

	onMount(() => {
		// Provider fragments cannot prove whether a session came from recovery.
		if (window.location.hash) {
			replaceState(resolve('/auth/reset-password'), $page.state);
			tokenError = true;
		} else if (hasSession) {
			completion = $page.data.passwordCompletion ?? null;
			if (completion === 'complete') {
				finishPassword();
				return;
			}
			if (completion) {
				sessionReady = true;
				return;
			}
			void loadMfaStatus();
		} else {
			tokenError = true;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		if (loading || requiresMfa || completion) return;
		error = '';

		const passwordError = validatePassword(password);
		if (passwordError) {
			error = passwordError;
			return;
		}

		if (password !== confirmPassword) {
			error = PASSWORD_MISMATCH_MESSAGE;
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

			if (updateResponse.redirected) {
				await goto(updateResponse.url);
				return;
			}
			const updateResult = await readJsonResult(updateResponse);
			if (updateResult?.code === 'password_reconciliation_required') {
				completion = reconciledPasswordState(updateResult);
				password = confirmPassword = '';
				if (completion === 'complete') finishPassword();
				return;
			}
			if (hasPendingPasswordCompletion(updateResponse, updateResult)) {
				completion = 'pending';
				password = '';
				confirmPassword = '';
				return;
			}
			if (updateResponse.status === 403 && updateResult.code === 'mfa_required') {
				requiresMfa = true;
				return;
			}
			if (!updateResult.ok) {
				if (updateResponse.status >= 500 || updateResponse.ok) {
					completion = 'started';
					password = confirmPassword = '';
				}
				error = updateResult.error || 'Unable to confirm the password update. Your password may have changed.';
				return;
			}

			finishPassword();
		} catch {
			completion = 'started';
			password = confirmPassword = '';
			error = 'Unable to confirm the password update. Your password may have changed.';
		} finally {
			loading = false;
			await tick();
			if (error && !requiresMfa && form.isConnected) form.querySelector<HTMLInputElement>('input')?.focus();
		}
	}
	function finishPassword() {
		completion = null;
		success = true;
		clearTimeout(navigationTimer);
		navigationTimer = setTimeout(() => goto(resolve('/dashboard')), 3000);
	}
</script>

<svelte:head>
	<title>Reset Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	headline={['New password.', 'Back in.']}
	lede="Once the recovery link checks out, this is the last stop before you're back inside."
	steps={{
		label: 'How a reset works',
		items: [
			{ title: 'Ask for a link', detail: 'Use the email on your account.' },
			{ title: 'Open the email', detail: 'Check spam if it is slow.' },
			{ title: 'Choose a password', detail: 'Then sign in as usual.' }
		]
	}}
	alternatives={[{ prompt: 'Need to exit?', label: 'Sign out', signOut: true }]}
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
		? "You'll be redirected to your dashboard shortly."
		: tokenError
			? 'This reset link can no longer be used.'
			: statusError
				? 'Retry the security check to continue your password reset.'
				: sessionReady && requiresMfa
					? 'Enter the current 6-digit code from your authenticator app before setting a new password.'
					: sessionReady
						? 'Enter the new password you want to use for future sign-ins.'
						: "We're confirming the recovery session before allowing a password change."}
>
	<div class="flex flex-col gap-5">
		{#if success}
			<AuthNotice tone="success" title="Password updated" centered>
				<p>Your password has been reset successfully.</p>
				<p>Redirecting you to your dashboard now.</p>
			</AuthNotice>
		{:else if tokenError}
			<AuthNotice tone="error" title="Reset link unavailable" centered>
				<p>This reset link uses an older format or has expired. Request a fresh reset email.</p>
			</AuthNotice>
			<AuthButton href={resolve('/auth/forgot-password')}>Request a new reset link</AuthButton>
		{:else if statusError}
			<AuthNotice tone="error" message="We could not verify your account security settings. Please try again." />
			<AuthButton type="button" onclick={loadMfaStatus} loading={checkingStatus} loadingLabel="Checking security...">
				Retry security check
			</AuthButton>
		{:else if !sessionReady}
			<div class="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
				<Spinner class="text-primary" />
				<p class="m-0 text-sm leading-relaxed">Verifying reset link...</p>
			</div>
		{:else if completion}
			<PasswordCompletion
				state={completion}
				onrestart={async () => {
					completion = null;
					await tick();
					document.getElementById('password')?.focus();
				}}
				oncomplete={finishPassword}
			/>
		{:else if requiresMfa}
			<PasswordMfaChallenge
				onverified={async () => {
					requiresMfa = false;
					error = '';
					await tick();
					document.getElementById('password')?.focus();
				}}
			/>
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
					hint="Use 12 to 72 characters with uppercase, lowercase, and a number."
				>
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>

				<ul class="grid gap-2 text-xs leading-normal text-muted-foreground" aria-live="polite">
					<li class={requirements.minLength ? 'text-success-foreground' : undefined}>
						<span class="sr-only">{requirements.minLength ? 'Met: ' : 'Needed: '}</span>At least 12 characters
					</li>
					<li class={requirements.maxLength ? 'text-success-foreground' : undefined}>
						<span class="sr-only">{requirements.maxLength ? 'Met: ' : 'Needed: '}</span>72 characters or fewer
					</li>
					<li class={requirements.uppercase ? 'text-success-foreground' : undefined}>
						<span class="sr-only">{requirements.uppercase ? 'Met: ' : 'Needed: '}</span>One uppercase letter
					</li>
					<li class={requirements.lowercase ? 'text-success-foreground' : undefined}>
						<span class="sr-only">{requirements.lowercase ? 'Met: ' : 'Needed: '}</span>One lowercase letter
					</li>
					<li class={requirements.digit ? 'text-success-foreground' : undefined}>
						<span class="sr-only">{requirements.digit ? 'Met: ' : 'Needed: '}</span>One number
					</li>
				</ul>

				<AuthField
					label="Confirm New Password"
					id="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					error={confirmError}
					hint={passwordsMatch ? 'Passwords match.' : undefined}
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				<AuthButton disabled={!canSubmit} {loading} loadingLabel="Updating Password...">Update Password</AuthButton>
			</form>
		{/if}
	</div>
</AuthShell>
