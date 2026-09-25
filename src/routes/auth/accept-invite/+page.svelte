<script lang="ts">
	import { hasPendingPasswordCompletion, PasswordCompletion, PasswordMfaChallenge } from '$features/identity';
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
	import { onMount, onDestroy, tick } from 'svelte';
	import { establishSession, readSessionTokens, type SessionTokens } from '$features/identity';

	const hasSession = $derived($page.data.hasSession);

	let requiresMfa = $state(false);
	let passwordSet = $state(false);
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let noPendingInvite = $state(false);
	let setupRequired = $state(false);
	let unavailableInvitations = $state(0);
	let navigationTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(navigationTimer));
	let sessionReady = $state(false);
	let tokenError = $state(false);
	let sessionError = $state(false);
	let establishingSession = $state(false);
	let tokens: SessionTokens | null = null;
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

	async function readJsonResult(response: Response): Promise<{
		ok: boolean;
		error?: string;
		code?: string;
		passwordUpdated?: boolean;
		activated?: boolean;
		unavailable?: number;
	}> {
		try {
			const payload = (await response.json()) as {
				ok?: boolean;
				error?: string;
				code?: string;
				passwordUpdated?: boolean;
				activated?: boolean;
				unavailable?: number;
			};
			return {
				ok: response.ok && payload?.ok === true && payload.error === undefined,
				error: typeof payload?.error === 'string' ? payload.error : undefined,
				code: typeof payload?.code === 'string' ? payload.code : undefined,
				passwordUpdated: payload?.passwordUpdated === true,
				activated: payload?.activated === true,
				unavailable:
					Number.isSafeInteger(payload?.unavailable) && payload.unavailable! >= 0 ? payload.unavailable : undefined
			};
		} catch {
			return { ok: false };
		}
	}

	async function verifySession() {
		if (!tokens || establishingSession) return;
		establishingSession = true;
		try {
			const result = await establishSession(tokens, 'invite');
			if (result === 'ready') {
				sessionError = false;
				tokens = null;
				replaceState(resolve('/auth/accept-invite'), $page.state);
				sessionReady = true;
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
			noPendingInvite = $page.data.invitePending === false;
			completion = $page.data.passwordCompletion ?? null;
			if (completion === 'complete') {
				completion = null;
				passwordSet = true;
			}
			sessionReady = true;
		} else {
			tokenError = true;
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		if (loading || requiresMfa || passwordSet || completion) return;
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

			passwordSet = true;
			password = '';
			confirmPassword = '';
			await finalizeInvite();
		} catch {
			if (!passwordSet) completion = 'started';
			password = confirmPassword = '';
			error = passwordSet
				? 'Your password is set. We could not finish account activation. Please try again.'
				: 'Unable to confirm the password update. Your password may have changed.';
		} finally {
			loading = false;
			await tick();
			if (passwordSet && !requiresMfa && !success) document.getElementById('finish-activation')?.focus();
			if (error && !passwordSet && !requiresMfa && form.isConnected)
				form.querySelector<HTMLInputElement>('input')?.focus();
		}
	}
	async function finalizeInvite() {
		const response = await fetch('/api/auth/finalize-invite', { method: 'POST' });
		if (response.redirected) {
			await goto(response.url);
			return;
		}
		const result = await readJsonResult(response);
		if (response.status === 403 && result.code === 'invite_not_pending') {
			noPendingInvite = true;
			return;
		}
		setupRequired = result.code === 'setup_required';
		if (response.status === 403 && result.code === 'mfa_required') {
			requiresMfa = true;
			return;
		}
		if (!result.ok || !result.activated || result.unavailable === undefined) {
			error = result.error || 'Your password is set. We could not finish account activation. Please try again.';
			return;
		}
		unavailableInvitations = result.unavailable;
		success = true;
		if (!unavailableInvitations)
			navigationTimer = setTimeout(() => {
				void goto(resolve('/dashboard')).catch(() => {});
			}, 2000);
	}

	async function retryFinalization() {
		if (loading || requiresMfa || !passwordSet || success) return;
		loading = true;
		error = '';
		try {
			await finalizeInvite();
		} catch {
			error = 'Your password is set. We could not finish account activation. Please try again.';
		} finally {
			loading = false;
			await tick();
			if (passwordSet && !requiresMfa && !success) document.getElementById('finish-activation')?.focus();
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
	panelTitle={noPendingInvite
		? 'No activation pending'
		: success
			? 'Account activated'
			: tokenError
				? 'Invite unavailable'
				: passwordSet
					? 'Finish account activation'
					: sessionReady
						? 'Set your password'
						: 'Verifying invite link'}
	panelDescription={noPendingInvite
		? 'You are signed in. Continue to your dashboard to view your Organization access.'
		: success
			? unavailableInvitations
				? 'Your account is ready. Review the invitation outcome below.'
				: 'Redirecting you to your dashboard.'
			: tokenError
				? 'This invite link can no longer be used.'
				: passwordSet
					? 'Your password is set. Finish activating your account.'
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
	<div class="flex flex-col gap-5">
		{#if noPendingInvite}
			<Button href={resolve('/dashboard')}>Continue to dashboard</Button>
		{:else if success}
			<AuthNotice tone="success" title="Account activated" centered>
				<p>Your password has been set successfully.</p>
				{#if unavailableInvitations}
					<p>
						Some Organization invitations are expired or unavailable. They did not grant membership. Ask the inviting
						Organization for help.
					</p>
				{:else}<p>Redirecting you to the dashboard now.</p>{/if}
			</AuthNotice>
			<Button href={resolve('/dashboard')}>Continue to dashboard</Button>
		{:else if sessionError}
			<AuthNotice tone="error" message="We could not verify this session. Please try again." />
			<Button type="button" onclick={verifySession} disabled={establishingSession} class="w-full">
				{#if establishingSession}<Spinner />Verifying session...{:else}Retry verification{/if}
			</Button>
		{:else if tokenError}
			<AuthNotice tone="error" title="Invite unavailable" centered>
				<p>This invite link is invalid or has expired.</p>
				<p><a href={resolve('/auth/renew-invite')}>Need a fresh invite? Renew it here.</a></p>
			</AuthNotice>
		{:else if !sessionReady}
			<div class="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
				<Spinner class="text-primary" />
				<p class="m-0 text-sm leading-relaxed">Verifying invite link...</p>
			</div>
		{:else if completion}
			<PasswordCompletion
				state={completion}
				onrestart={async () => {
					completion = null;
					await tick();
					document.getElementById('password')?.focus();
				}}
				oncomplete={async () => {
					completion = null;
					passwordSet = true;
					await tick();
					document.getElementById('finish-activation')?.focus();
				}}
			/>
		{:else if requiresMfa}
			<PasswordMfaChallenge
				hint={passwordSet
					? 'Enter the current 6-digit code from your authenticator app before finishing account activation.'
					: undefined}
				onverified={async () => {
					requiresMfa = false;
					error = '';
					await tick();
					document.getElementById(passwordSet ? 'finish-activation' : 'password')?.focus();
				}}
			/>
		{:else if passwordSet}
			{#if setupRequired}<Button href={resolve('/auth/renew-invite')}>Request an Account Setup Link</Button>{/if}
			{#if error}<AuthNotice tone="error" message={error} />{/if}
			<Button id="finish-activation" type="button" onclick={retryFinalization} disabled={loading}>
				{#if loading}<Spinner />Finishing activation...{:else}Finish activation{/if}
			</Button>
		{:else}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleSubmit} class="flex flex-col gap-5">
				<AuthField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					bind:value={password}
					required
					placeholder="At least 12 characters"
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
							Setting Password...
						{:else}
							Set Password
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
				Leave this invite flow and
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
