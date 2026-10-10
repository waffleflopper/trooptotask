<script lang="ts">
	import {
		hasPendingPasswordCompletion,
		PasswordCompletion,
		PasswordMfaChallenge,
		PASSWORD_MISMATCH_MESSAGE,
		passwordRequirements
	} from '$features/identity';
	import type { PasswordCompletionState } from '$features/identity/contracts';
	let completion = $state<PasswordCompletionState>(null);
	import { onMount, tick, untrack } from 'svelte';
	import type { MfaActionResponse } from '$features/identity/contracts';
	let passwordMfaRequired = $state(false);
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Failures that describe a single field; the same messages from the server and API handlers, matched exactly.
	const INCORRECT_PASSWORD_MESSAGE = 'Current password is incorrect';
	const ENROLLMENT_CODE_REJECTED_MESSAGE = 'Invalid enrollment code. Try again.';
	const DISABLE_CODE_REJECTED_MESSAGE = 'Invalid authenticator code. Try again.';
	const EMAIL_FIELD_ERRORS = new Map<string, 'email' | 'password'>([
		['Enter a valid email address', 'email'],
		['Enter a different email address', 'email'],
		['Enter your current password to change your email', 'password'],
		[INCORRECT_PASSWORD_MESSAGE, 'password']
	]);

	let checkingMfaStatus = $state(false);
	async function retryMfaStatus() {
		checkingMfaStatus = true;
		try {
			await invalidateAll();
		} catch {
			// Keep the unknown state and retry available without exposing transport errors.
		} finally {
			checkingMfaStatus = false;
		}
	}

	let enrolling = $state(false);
	let qrCode = $state('');
	let factorId = $state('');
	let verifyCode = $state('');
	let mfaError = $state('');
	let verifyCodeError = $state('');
	let disableCodeError = $state('');
	let mfaSuccess = $state('');
	let loading = $state(false);
	let disabling = $state(false);
	let confirmingDisable = $state(false);
	let disableCode = $state('');
	let passwordError = $state('');
	let currentPasswordError = $state('');
	let passwordLoading = $state(false);
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let emailLoading = $state(false);
	let emailCurrentPassword = $state('');
	let emailDraft = $state(untrack(() => form?.email ?? ''));
	let emailResult = $state<ActionData>(untrack(() => form));
	let emailMfaRequired = $state(false);
	let confirmedPendingEmail = $state<string | null>(untrack(() => form?.pendingEmail ?? null));
	const submitEmail: SubmitFunction = ({ cancel, formElement }) => {
		if (emailLoading || emailMfaRequired) {
			cancel();
			return;
		}
		emailLoading = true;
		emailResult = null;
		return async ({ result, update }) => {
			try {
				if (result.type === 'redirect') {
					await update();
					return;
				}
				if (result.type === 'failure') {
					const failure = result.data as ActionData & { error?: unknown };
					emailResult =
						typeof failure?.emailError === 'string'
							? failure
							: {
									emailError:
										typeof failure?.error === 'string'
											? failure.error
											: 'Unable to confirm the email request. Please try again.'
								};
					emailMfaRequired = emailResult?.code === 'mfa_required';
				} else if (
					result.type === 'success' &&
					typeof result.data?.emailSuccess === 'string' &&
					typeof result.data?.pendingEmail === 'string' &&
					result.data.pendingEmail === emailDraft.trim().toLowerCase()
				) {
					emailResult = result.data as ActionData;
					confirmedPendingEmail = result.data.pendingEmail;
					emailCurrentPassword = '';
					await update({ reset: false });
				} else {
					emailResult = {
						emailError: 'Unable to confirm the email request. Check your inboxes or reload before retrying.'
					};
				}
			} catch {
				emailResult = {
					emailError: 'Unable to refresh the email status. Check your inboxes or reload before retrying.'
				};
			} finally {
				emailLoading = false;
				await tick();
				if (emailResult?.emailError && !emailMfaRequired && formElement.isConnected)
					formElement.querySelector<HTMLInputElement>('#email-current-password')?.focus();
			}
		};
	};

	onMount(() => {
		completion = data.passwordCompletion ?? null;
	});
	// Local acknowledgments apply until authoritative loader data changes.
	let mfaEnabled = $derived(data.hasMFA);
	const pendingEmail = $derived(confirmedPendingEmail ?? data.pendingEmail);
	const emailErrorField = $derived(
		emailResult?.emailError ? EMAIL_FIELD_ERRORS.get(emailResult.emailError) : undefined
	);
	const requirements = $derived(passwordRequirements(newPassword));
	const passwordsMatch = $derived(newPassword.length > 0 && newPassword === confirmPassword);
	const confirmError = $derived(confirmPassword && !passwordsMatch ? PASSWORD_MISMATCH_MESSAGE : '');
	const passwordReady = $derived(currentPassword.length > 0 && requirements.valid && passwordsMatch);

	function clearMfaErrors() {
		mfaError = verifyCodeError = disableCodeError = '';
	}

	async function startEnroll() {
		if (loading) return;
		clearMfaErrors();
		mfaSuccess = '';
		enrolling = true;
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/enroll', { method: 'POST' });
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as { factorId?: string; qrCode?: string; error?: string };

			if (!response.ok || !payload.factorId || !payload.qrCode) {
				mfaError = payload.error ?? 'Failed to start MFA enrollment';
				enrolling = false;
				return;
			}

			factorId = payload.factorId;
			qrCode = payload.qrCode;
		} catch (e: unknown) {
			mfaError = e instanceof Error ? e.message : 'Failed to start MFA enrollment';
			enrolling = false;
		} finally {
			loading = false;
		}
	}

	async function verifyEnrollment() {
		if (loading) return;
		clearMfaErrors();
		if (!/^\d{6}$/.test(verifyCode)) {
			verifyCodeError = 'Please enter a 6-digit code';
			return;
		}

		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/enroll/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ factorId, code: verifyCode })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}

			const payload = (await response.json()) as MfaActionResponse | null;
			if (!response.ok || payload?.ok !== true) {
				const message = payload?.error ?? 'Verification failed';
				if (message === ENROLLMENT_CODE_REJECTED_MESSAGE) verifyCodeError = message;
				else mfaError = message;
				return;
			}

			mfaSuccess = 'MFA has been enabled successfully.';
			mfaEnabled = true;
			enrolling = false;
			factorId = '';
			qrCode = '';
			verifyCode = '';
		} catch (e: unknown) {
			mfaError = e instanceof Error ? e.message : 'Verification failed';
		} finally {
			loading = false;
		}
	}

	async function cancelEnroll() {
		if (loading) return;
		clearMfaErrors();
		loading = true;
		try {
			if (factorId) {
				const response = await fetch('/api/auth/mfa/enroll/cancel', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ factorId })
				});
				if (response.redirected) {
					await goto(response.url);
					return;
				}
				const payload = (await response.json()) as MfaActionResponse | null;
				if (!response.ok || payload?.ok !== true) {
					mfaError = payload?.error ?? 'Failed to cancel MFA enrollment';
					return;
				}
			}
			enrolling = false;
			qrCode = '';
			factorId = '';
			verifyCode = '';
		} catch (e: unknown) {
			mfaError = e instanceof Error ? e.message : 'Failed to cancel MFA enrollment';
		} finally {
			loading = false;
		}
	}

	async function disableMFA() {
		if (disabling) return;
		clearMfaErrors();
		if (!disableCode || disableCode.length !== 6) {
			disableCodeError = 'Please enter the 6-digit code from your authenticator app.';
			return;
		}

		mfaSuccess = '';
		disabling = true;
		try {
			const response = await fetch('/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: disableCode })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}

			const payload = (await response.json()) as MfaActionResponse | null;
			if (!response.ok || payload?.ok !== true) {
				const message = payload?.error ?? 'Failed to disable MFA';
				if (message === DISABLE_CODE_REJECTED_MESSAGE) disableCodeError = message;
				else mfaError = message;
				return;
			}

			mfaSuccess = 'MFA has been disabled.';
			mfaEnabled = false;
			confirmingDisable = false;
			disableCode = '';
		} catch (e: unknown) {
			mfaError = e instanceof Error ? e.message : 'Failed to disable MFA';
		} finally {
			disabling = false;
		}
	}

	async function changePassword(form: HTMLFormElement) {
		if (passwordLoading || passwordMfaRequired || completion) return;
		passwordError = currentPasswordError = '';

		if (!passwordReady) {
			passwordError = 'Complete the current password and new password requirements.';
			return;
		}

		passwordLoading = true;
		try {
			const response = await fetch('/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword })
			});
			if (response.redirected) {
				await goto(response.url);
				return;
			}
			const payload = (await response.json()) as { ok?: boolean; error?: unknown; code?: string } | null;
			if (payload?.code === 'password_reconciliation_required') {
				completion = 'started';
				currentPassword = newPassword = confirmPassword = '';
				return;
			}
			if (hasPendingPasswordCompletion(response, payload)) {
				completion = 'pending';
				currentPassword = '';
				newPassword = '';
				confirmPassword = '';
				return;
			}
			if (response.status === 403 && payload?.code === 'mfa_required') {
				passwordMfaRequired = true;
				return;
			}

			if (!response.ok || payload?.ok !== true || payload.error !== undefined) {
				if (response.status >= 500 || response.ok) {
					completion = 'started';
					currentPassword = newPassword = confirmPassword = '';
				}
				const message =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to confirm the password update. Your password may have changed.';
				if (response.status === 401 && message === INCORRECT_PASSWORD_MESSAGE) currentPasswordError = message;
				else passwordError = message;
				return;
			}

			completion = 'complete';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch {
			completion = 'started';
			currentPassword = newPassword = confirmPassword = '';
			passwordError = 'Unable to confirm the password update. Your password may have changed.';
		} finally {
			passwordLoading = false;
			await tick();
			if ((passwordError || currentPasswordError) && !passwordMfaRequired && form.isConnected)
				form.querySelector<HTMLInputElement>('input')?.focus();
		}
	}

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		verifyCode = input.value.replace(/\D/g, '').slice(0, 6);
	}

	function handleDisableCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		disableCode = input.value.replace(/\D/g, '').slice(0, 6);
	}

	function startDisableMFA() {
		clearMfaErrors();
		mfaSuccess = '';
		confirmingDisable = true;
		disableCode = '';
	}

	function cancelDisableMFA() {
		confirmingDisable = false;
		disableCode = '';
		clearMfaErrors();
	}
</script>

<svelte:head>
	<title>Account Security - Troop to Task</title>
</svelte:head>

<div class="grid gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Email</Card.Title>
			<Card.Description>Your current email remains active until a new address is confirmed.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/updateEmail" use:enhance={submitEmail} class="grid gap-4">
				{#if emailResult?.emailError && !emailErrorField}
					<Alert.Root variant="destructive">
						<Alert.Title>Email request not confirmed</Alert.Title>
						<Alert.Description>{emailResult.emailError}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if emailResult?.emailSuccess}
					<Alert.Root variant="success">
						<Alert.Title>Confirmation sent</Alert.Title>
						<Alert.Description>{emailResult.emailSuccess}</Alert.Description>
					</Alert.Root>
				{/if}

				<div class="grid gap-3 text-sm">
					<div>
						<p class="font-medium">Current email</p>
						<p class="text-muted-foreground">{data.currentEmail}</p>
					</div>
					{#if pendingEmail}
						<div>
							<p class="font-medium">Pending email</p>
							<p class="text-muted-foreground">{pendingEmail}</p>
						</div>
					{/if}
				</div>

				<Field.Root data-invalid={emailErrorField === 'email' ? true : undefined}>
					<Field.Label for="email">New email address</Field.Label>
					<Field.Control>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							aria-invalid={emailErrorField === 'email' ? true : undefined}
							aria-describedby={emailErrorField === 'email' ? 'email-error' : undefined}
							bind:value={emailDraft}
							disabled={emailLoading || emailMfaRequired}
						/>
					</Field.Control>
					{#if emailErrorField === 'email'}
						<Field.Error id="email-error">{emailResult?.emailError}</Field.Error>
					{/if}
					<Field.Description
						>Follow the confirmation instructions in both your current and new inboxes before using the new address to
						sign in.</Field.Description
					>
				</Field.Root>

				<Field.Root data-invalid={emailErrorField === 'password' ? true : undefined}>
					<Field.Label for="email-current-password">Current password</Field.Label>
					<Field.Control>
						<Input
							id="email-current-password"
							name="currentPassword"
							type="password"
							autocomplete="current-password"
							required
							aria-invalid={emailErrorField === 'password' ? true : undefined}
							aria-describedby={emailErrorField === 'password' ? 'email-current-password-error' : undefined}
							bind:value={emailCurrentPassword}
							disabled={emailLoading || emailMfaRequired}
						/>
					</Field.Control>
					{#if emailErrorField === 'password'}
						<Field.Error id="email-current-password-error">{emailResult?.emailError}</Field.Error>
					{/if}
				</Field.Root>

				<div class="flex justify-end">
					<Button type="submit" disabled={emailLoading || emailMfaRequired}>
						{#if emailLoading}<Spinner />{/if}
						Send Confirmation
					</Button>
				</div>
			</form>
			{#if emailMfaRequired}
				<PasswordMfaChallenge
					id="email-mfa-code"
					hint="Enter the current 6-digit code from your authenticator app before changing your email."
					onverified={async () => {
						emailMfaRequired = false;
						emailResult = null;
						await tick();
						document.getElementById('email-current-password')?.focus();
					}}
				/>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Password</Card.Title>
			<Card.Description>Verify your current password before setting a new one.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if completion}
				<PasswordCompletion
					state={completion}
					oncomplete={() => {
						completion = 'complete';
					}}
					onrestart={async () => {
						completion = null;
						await tick();
						document.getElementById('current-password')?.focus();
					}}
				/>
			{:else if passwordMfaRequired}
				<PasswordMfaChallenge
					onverified={async () => {
						passwordMfaRequired = false;
						await tick();
						document.getElementById('current-password')?.focus();
					}}
				/>
			{:else}
				<form
					class="grid gap-4"
					onsubmit={(event) => {
						event.preventDefault();
						void changePassword(event.currentTarget);
					}}
				>
					{#if passwordError}
						<Alert.Root variant="destructive">
							<Alert.Title>Password update not confirmed</Alert.Title>
							<Alert.Description>{passwordError}</Alert.Description>
						</Alert.Root>
					{/if}

					<Field.Root data-invalid={currentPasswordError ? true : undefined}>
						<Field.Label for="current-password">Current password</Field.Label>
						<Field.Control>
							<Input
								id="current-password"
								type="password"
								autocomplete="current-password"
								bind:value={currentPassword}
							/>
						</Field.Control>
						{#if currentPasswordError}<Field.Error>{currentPasswordError}</Field.Error>{/if}
					</Field.Root>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="new-password">New password</Field.Label>
							<Field.Control>
								<Input
									id="new-password"
									type="password"
									autocomplete="new-password"
									aria-describedby="new-password-requirements"
									bind:value={newPassword}
								/>
							</Field.Control>
						</Field.Root>

						<Field.Root data-invalid={confirmError ? true : undefined}>
							<Field.Label for="confirm-password">Confirm new password</Field.Label>
							<Field.Control>
								<Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirmPassword} />
							</Field.Control>
							{#if confirmError}<Field.Error>{confirmError}</Field.Error>{/if}
						</Field.Root>
					</div>

					<ul id="new-password-requirements" class="grid gap-1 text-sm text-muted-foreground">
						<li class={requirements.minLength ? 'text-foreground' : undefined}>
							<span class="sr-only">{requirements.minLength ? 'Met: ' : 'Needed: '}</span>At least 12 characters
						</li>
						<li class={requirements.maxLength ? 'text-foreground' : undefined} aria-live="polite" aria-atomic="true">
							<span class="sr-only">{requirements.maxLength ? 'Met: ' : 'Needed: '}</span>72 characters or fewer
						</li>
						<li class={requirements.uppercase ? 'text-foreground' : undefined}>
							<span class="sr-only">{requirements.uppercase ? 'Met: ' : 'Needed: '}</span>Includes uppercase
						</li>
						<li class={requirements.lowercase ? 'text-foreground' : undefined}>
							<span class="sr-only">{requirements.lowercase ? 'Met: ' : 'Needed: '}</span>Includes lowercase
						</li>
						<li class={requirements.digit ? 'text-foreground' : undefined}>
							<span class="sr-only">{requirements.digit ? 'Met: ' : 'Needed: '}</span>Includes a number
						</li>
						<li class={passwordsMatch ? 'text-foreground' : undefined}>
							<span class="sr-only">{passwordsMatch ? 'Met: ' : 'Needed: '}</span>Passwords match
						</li>
					</ul>

					<div class="flex justify-end">
						<Button type="submit" disabled={passwordLoading || !passwordReady}>
							{#if passwordLoading}<Spinner />{/if}
							Update Password
						</Button>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Multi-Factor Authentication</Card.Title>
			<Card.Description>Require a fresh authenticator code when signing in.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if mfaError}
				<Alert.Root variant="destructive">
					<Alert.Title>Security issue</Alert.Title>
					<Alert.Description>{mfaError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if mfaSuccess}
				<Alert.Root variant="success">
					<Alert.Title>Security updated</Alert.Title>
					<Alert.Description>{mfaSuccess}</Alert.Description>
				</Alert.Root>
			{/if}

			<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/25 p-4">
				<div>
					<p class="font-medium">
						{mfaEnabled === null ? 'MFA status unavailable' : mfaEnabled ? 'Enabled' : 'Disabled'}
					</p>
					<p class="text-sm text-muted-foreground">
						{mfaEnabled === null
							? 'Unable to check your authenticator. Retry before changing MFA.'
							: mfaEnabled
								? 'Account sign-in is protected with a second factor.'
								: 'Only password-based sign-in is active.'}
					</p>
				</div>

				{#if mfaEnabled === null}
					<Button type="button" variant="outline" onclick={retryMfaStatus} disabled={checkingMfaStatus}>
						{checkingMfaStatus ? 'Checking MFA status' : 'Retry MFA status'}
					</Button>
				{/if}

				{#if mfaEnabled === false && !enrolling}
					<Button type="button" onclick={startEnroll} disabled={loading}>
						{#if loading}<Spinner />{/if}
						Enable MFA
					</Button>
				{/if}

				{#if mfaEnabled && !enrolling && !confirmingDisable}
					<Button type="button" variant="destructive" onclick={startDisableMFA} disabled={disabling}>Disable MFA</Button
					>
				{/if}
			</div>

			{#if enrolling && qrCode}
				<div class="grid gap-4 rounded-md border p-4">
					<div class="grid gap-2">
						<h3 class="text-base font-medium">Scan the QR code</h3>
						<p class="text-sm text-muted-foreground">
							Use Google Authenticator, Authy, 1Password, or another compatible app, then enter the 6-digit code.
						</p>
					</div>
					<img src={qrCode} alt="MFA QR Code" class="size-48 rounded-md border bg-background p-3" />
					<form
						class="grid gap-4"
						onsubmit={(e) => {
							e.preventDefault();
							void verifyEnrollment();
						}}
					>
						<Field.Root data-invalid={verifyCodeError ? true : undefined}>
							<Field.Label for="verify-code">Verification code</Field.Label>
							<Field.Control>
								<Input
									id="verify-code"
									disabled={loading}
									type="text"
									value={verifyCode}
									oninput={handleCodeInput}
									placeholder="000000"
									maxlength={6}
									autocomplete="one-time-code"
									inputmode="numeric"
								/>
							</Field.Control>
							{#if verifyCodeError}<Field.Error>{verifyCodeError}</Field.Error>{/if}
						</Field.Root>
						<div class="flex flex-wrap justify-end gap-2">
							<Button type="button" variant="outline" onclick={cancelEnroll} disabled={loading}>Cancel</Button>
							<Button type="submit" disabled={loading || verifyCode.length !== 6}>
								{#if loading}<Spinner />{/if}
								Verify and Enable
							</Button>
						</div>
					</form>
				</div>
			{/if}

			{#if mfaEnabled && confirmingDisable}
				<form
					class="grid gap-4 rounded-md border p-4"
					onsubmit={(e) => {
						e.preventDefault();
						void disableMFA();
					}}
				>
					<div class="grid gap-2">
						<h3 class="text-base font-medium">Confirm with your authenticator code</h3>
						<p class="text-sm text-muted-foreground">
							Enter a fresh 6-digit code before MFA can be removed from this account.
						</p>
					</div>
					<Field.Root data-invalid={disableCodeError ? true : undefined}>
						<Field.Label for="disable-code">Authenticator code</Field.Label>
						<Field.Control>
							<Input
								id="disable-code"
								disabled={disabling}
								type="text"
								value={disableCode}
								oninput={handleDisableCodeInput}
								placeholder="000000"
								maxlength={6}
								autocomplete="one-time-code"
								inputmode="numeric"
							/>
						</Field.Control>
						{#if disableCodeError}<Field.Error>{disableCodeError}</Field.Error>{/if}
					</Field.Root>
					<div class="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="outline" onclick={cancelDisableMFA} disabled={disabling}
							>Keep MFA Enabled</Button
						>
						<Button type="submit" variant="destructive" disabled={disabling || disableCode.length !== 6}>
							{#if disabling}<Spinner />{/if}
							Confirm and Disable
						</Button>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
