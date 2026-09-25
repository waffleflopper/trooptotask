<script lang="ts">
	import {
		hasPendingPasswordCompletion,
		PasswordCompletion,
		PasswordMfaChallenge,
		passwordRequirements,
		validatePassword
	} from '$features/identity';
	import type { PasswordCompletionState } from '$features/identity/contracts';
	let completion = $state<PasswordCompletionState>(null);
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { onMount, tick } from 'svelte';
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

	const requirements = $derived(passwordRequirements(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const canSubmit = $derived(requirements.valid && passwordsMatch && !loading);

	async function readJsonResult(
		response: Response
	): Promise<{ ok: boolean; error?: string; code?: string; passwordUpdated?: boolean }> {
		try {
			const payload = (await response.json()) as {
				ok?: boolean;
				error?: string;
				code?: string;
				passwordUpdated?: boolean;
			};
			return {
				ok: response.ok && payload?.ok === true && payload.error === undefined,
				error: typeof payload?.error === 'string' ? payload.error : undefined,
				code: typeof payload?.code === 'string' ? payload.code : undefined,
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

			if (updateResponse.redirected) {
				await goto(updateResponse.url);
				return;
			}
			const updateResult = await readJsonResult(updateResponse);
			if (updateResult?.code === 'password_reconciliation_required') {
				completion = 'started';
				password = confirmPassword = '';
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
		setTimeout(() => goto(resolve('/auth/login')), 3000);
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
		{:else if tokenError}
			<AuthNotice tone="error" title="Reset link unavailable" centered>
				<p>This reset link uses an older format or has expired. Request a fresh reset email.</p>
			</AuthNotice>
			<Button href={resolve('/auth/forgot-password')}>Request a new reset link</Button>
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
					placeholder="At least 12 characters"
					hint="Use 12 to 128 characters with uppercase, lowercase, and a number."
				>
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>

				<ul class="grid gap-2 text-xs leading-normal text-muted-foreground" aria-live="polite">
					<li class={requirements.minLength ? 'text-success' : undefined}>
						<span class="sr-only">{requirements.minLength ? 'Met: ' : 'Needed: '}</span>At least 12 characters
					</li>
					<li class={requirements.maxLength ? 'text-success' : undefined}>
						<span class="sr-only">{requirements.maxLength ? 'Met: ' : 'Needed: '}</span>128 characters or fewer
					</li>
					<li class={requirements.uppercase ? 'text-success' : undefined}>
						<span class="sr-only">{requirements.uppercase ? 'Met: ' : 'Needed: '}</span>One uppercase letter
					</li>
					<li class={requirements.lowercase ? 'text-success' : undefined}>
						<span class="sr-only">{requirements.lowercase ? 'Met: ' : 'Needed: '}</span>One lowercase letter
					</li>
					<li class={requirements.digit ? 'text-success' : undefined}>
						<span class="sr-only">{requirements.digit ? 'Met: ' : 'Needed: '}</span>One number
					</li>
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
