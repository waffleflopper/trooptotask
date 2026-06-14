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
					replaceState(resolve('/auth/accept-invite'), $page.state);
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
			setTimeout(() => goto(resolve('/dashboard')), 2000);
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
	<div class="flex flex-col gap-5">
		{#if success}
			<AuthNotice tone="success" title="Account activated" centered>
				<p>Your password has been set successfully.</p>
				<p>Redirecting you to the dashboard now.</p>
			</AuthNotice>
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
