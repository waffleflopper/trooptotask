<script lang="ts" module>
	export type EmailActionData = {
		emailError?: string;
		email?: string;
		code?: 'mfa_required';
		retryAfterSeconds?: number;
		emailSuccess?: string;
		pendingEmail?: string;
	} | null;
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Check from '@lucide/svelte/icons/check';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import CodeField from './CodeField.svelte';
	import PasswordCompletion from './PasswordCompletion.svelte';
	import PasswordMfaChallenge from './PasswordMfaChallenge.svelte';
	import { ACCOUNT_PAGES } from './AccountShell.svelte';
	import { ACCOUNT_FIELD_LABEL } from './accountFields';
	import { hasPendingPasswordCompletion, reconciledPasswordState } from './passwordCompletion';
	import {
		PASSWORD_MAX_LENGTH,
		PASSWORD_MIN_LENGTH,
		PASSWORD_MISMATCH_MESSAGE,
		passwordChecklist
	} from './passwordPolicy';
	import {
		EMAIL_CHANGE_PASSWORD_REQUIRED_MESSAGE,
		INCORRECT_CURRENT_PASSWORD_MESSAGE,
		INVALID_EMAIL_MESSAGE,
		MFA_DISABLE_CODE_REJECTED_MESSAGE,
		SAME_EMAIL_MESSAGE,
		type AccountSecurityOverview,
		type MfaActionResponse,
		type PasswordCompletionState
	} from './contracts';

	let {
		security,
		passwordCompletion,
		form,
		mfaSetupHref
	}: {
		security: AccountSecurityOverview;
		passwordCompletion: PasswordCompletionState;
		form: EmailActionData;
		mfaSetupHref: string;
	} = $props();

	type Row = 'email' | 'password' | 'turn-off';

	const ROWS = ACCOUNT_PAGES.security.rows;

	const EMAIL_FIELD_ERRORS = new Map<string, 'email' | 'password'>([
		[INVALID_EMAIL_MESSAGE, 'email'],
		[SAME_EMAIL_MESSAGE, 'email'],
		[EMAIL_CHANGE_PASSWORD_REQUIRED_MESSAGE, 'password'],
		[INCORRECT_CURRENT_PASSWORD_MESSAGE, 'password']
	]);

	// A failed no-script submit reopens the email row with what the server sent back.
	let openRow = $state<Row | null>(untrack(() => (form?.emailError ? 'email' : null)));
	let disableCodeField = $state<ReturnType<typeof CodeField>>();
	let turnOnLink = $state<HTMLElement | null>(null);
	const rowTriggers: Record<Row, HTMLButtonElement | null> = $state({ email: null, password: null, 'turn-off': null });

	let emailLoading = $state(false);
	let emailDraft = $state(untrack(() => form?.email ?? ''));
	let emailCurrentPassword = $state('');
	let emailResult = $state<EmailActionData>(untrack(() => form));
	let emailMfaRequired = $state(false);
	let confirmedPendingEmail = $state<string | null>(untrack(() => form?.pendingEmail ?? null));
	const pendingEmail = $derived(confirmedPendingEmail ?? security.pendingEmail);
	const emailErrorField = $derived(
		emailResult?.emailError ? EMAIL_FIELD_ERRORS.get(emailResult.emailError) : undefined
	);

	let completion = $state<PasswordCompletionState>(untrack(() => passwordCompletion));
	let passwordMfaRequired = $state(false);
	let passwordLoading = $state(false);
	let passwordError = $state('');
	let currentPasswordError = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	const checklist = $derived(passwordChecklist(newPassword, confirmPassword));
	const confirmError = $derived(confirmPassword && newPassword !== confirmPassword ? PASSWORD_MISMATCH_MESSAGE : '');
	const passwordReady = $derived(currentPassword.length > 0 && checklist.every((item) => item.met));

	// Local acknowledgments apply until authoritative loader data changes.
	let mfaEnabled = $derived(security.hasMFA);
	let checkingMfaStatus = $state(false);
	let disabling = $state(false);
	let disableCode = $state('');
	let disableCodeError = $state('');
	let mfaError = $state('');
	let mfaSuccess = $state('');

	// Opening or closing a row starts a new version. A request's row-local writes apply only to the version that sent
	// it; account-wide outcomes (a pending email, a changed password, two-factor off) apply regardless.
	let rowVersion = 0;

	function resetDrafts() {
		rowVersion += 1;
		emailDraft = '';
		emailCurrentPassword = '';
		emailResult = null;
		emailMfaRequired = false;
		currentPassword = newPassword = confirmPassword = '';
		passwordError = currentPasswordError = '';
		passwordMfaRequired = false;
		disableCode = '';
		disableCodeError = mfaError = '';
	}

	async function focusFirstField(row: Row) {
		await tick();
		document.querySelector<HTMLElement>(`[data-account-row="${row}"] input:not([type=hidden])`)?.focus();
	}

	function openRowFor(row: Row) {
		resetDrafts();
		mfaSuccess = '';
		openRow = row;
		// CodeField focuses itself; the other rows start at their first field.
		if (row !== 'turn-off') void focusFirstField(row);
	}

	async function closeRow() {
		const row = openRow;
		resetDrafts();
		openRow = null;
		await tick();
		if (row) rowTriggers[row]?.focus();
	}

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

	const submitEmail: SubmitFunction = ({ cancel, formElement }) => {
		if (emailLoading || emailMfaRequired) {
			cancel();
			return;
		}
		const version = rowVersion;
		const requestedEmail = emailDraft.trim().toLowerCase();
		emailLoading = true;
		emailResult = null;
		return async ({ result, update }) => {
			const sameRow = () => version === rowVersion;
			let accepted = false;
			try {
				if (result.type === 'redirect') {
					await update();
					return;
				}
				if (!sameRow() && result.type !== 'success') return;
				if (result.type === 'failure') {
					const failure = result.data as EmailActionData & { error?: unknown };
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
					result.data.pendingEmail === requestedEmail
				) {
					accepted = true;
					confirmedPendingEmail = result.data.pendingEmail;
					if (sameRow()) {
						emailResult = result.data as EmailActionData;
						emailCurrentPassword = '';
						await update({ reset: false });
					} else {
						// Applying the action would move focus out of the row the user is now in; only the loader needs refreshing.
						await invalidateAll();
					}
				} else if (sameRow()) {
					emailResult = {
						emailError: 'Unable to confirm the email request. Check your inboxes or reload before retrying.'
					};
				}
			} catch {
				if (sameRow())
					emailResult = {
						emailError: 'Unable to refresh the email status. Check your inboxes or reload before retrying.'
					};
			} finally {
				emailLoading = false;
			}
			if (!sameRow()) return;
			if (accepted) {
				emailDraft = '';
				openRow = null;
			}
			await tick();
			if (accepted) rowTriggers.email?.focus();
			else if (emailResult?.emailError && !emailMfaRequired && formElement.isConnected)
				formElement
					.querySelector<HTMLInputElement>(emailErrorField === 'email' ? '#email' : '#email-current-password')
					?.focus();
		};
	};

	async function changePassword(formElement: HTMLFormElement) {
		if (passwordLoading || passwordMfaRequired || completion) return;
		passwordError = currentPasswordError = '';
		if (!passwordReady) {
			passwordError = 'Complete the current password and new password requirements.';
			return;
		}

		const version = rowVersion;
		const sameRow = () => version === rowVersion;
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
				completion = reconciledPasswordState(payload);
				currentPassword = newPassword = confirmPassword = '';
				return;
			}
			if (hasPendingPasswordCompletion(response, payload)) {
				completion = 'pending';
				currentPassword = newPassword = confirmPassword = '';
				return;
			}
			if (response.status === 403 && payload?.code === 'mfa_required') {
				if (sameRow()) passwordMfaRequired = true;
				return;
			}
			if (!response.ok || payload?.ok !== true || payload.error !== undefined) {
				if (response.status >= 500 || response.ok) {
					completion = 'started';
					currentPassword = newPassword = confirmPassword = '';
				}
				if (!sameRow()) return;
				const message =
					typeof payload?.error === 'string'
						? payload.error
						: 'Unable to confirm the password update. Your password may have changed.';
				if (response.status === 401 && message === INCORRECT_CURRENT_PASSWORD_MESSAGE) currentPasswordError = message;
				else passwordError = message;
				return;
			}
			completion = 'complete';
			currentPassword = newPassword = confirmPassword = '';
		} catch {
			completion = 'started';
			currentPassword = newPassword = confirmPassword = '';
			if (sameRow()) passwordError = 'Unable to confirm the password update. Your password may have changed.';
		} finally {
			passwordLoading = false;
			await tick();
			if ((passwordError || currentPasswordError) && !passwordMfaRequired && formElement.isConnected)
				formElement.querySelector<HTMLInputElement>('input')?.focus();
		}
	}

	async function disableMfa() {
		if (disabling) return;
		disableCodeError = mfaError = '';
		if (disableCode.length !== 6) {
			disableCodeError = 'Please enter the 6-digit code from your authenticator app.';
			return;
		}
		const version = rowVersion;
		const sameRow = () => version === rowVersion;
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
				if (!sameRow()) return;
				const message = payload?.error ?? 'Failed to disable MFA';
				if (message === MFA_DISABLE_CODE_REJECTED_MESSAGE) disableCodeError = message;
				else mfaError = message;
				return;
			}
			mfaEnabled = false;
			mfaSuccess = 'Two-factor is off.';
			disableCode = '';
			if (openRow === 'turn-off') openRow = null;
		} catch (cause: unknown) {
			if (sameRow()) mfaError = cause instanceof Error ? cause.message : 'Failed to disable MFA';
		} finally {
			disabling = false;
		}
		if (!sameRow()) return;
		// The code field was disabled while the request ran, so focus returns once it is enabled again.
		await tick();
		if (mfaEnabled) disableCodeField?.focus();
		else turnOnLink?.focus();
	}
</script>

{#snippet rowActions(confirmLabel: string, busy: boolean, ready: boolean, confirmVariant: 'default' | 'destructive')}
	<div class="flex flex-wrap justify-end gap-2">
		<Button type="button" variant="outline" size="sm" onclick={closeRow} disabled={busy}>Cancel</Button>
		<Button type="submit" size="sm" variant={confirmVariant} disabled={busy || !ready}>
			{#if busy}<Spinner />{/if}
			{confirmLabel}
		</Button>
	</div>
{/snippet}

<div class="grid gap-7">
	<PageShell.Header
		eyebrow="Account · Only you"
		title={ACCOUNT_PAGES.security.label}
		variant="display"
		subtitle={ACCOUNT_PAGES.security.subtitle}
	/>

	<PageShell.FactSection>
		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label={ROWS.email.label}
			description={ROWS.email.description}
			data-account-row="email"
		>
			<div class="flex min-w-0 items-center gap-4">
				<p class="min-w-0 flex-1 truncate text-[17px] font-semibold" title={security.currentEmail}>
					{security.currentEmail}
				</p>
				{#if openRow !== 'email'}
					<Button
						bind:ref={rowTriggers.email}
						type="button"
						variant="outline"
						size="sm"
						onclick={() => openRowFor('email')}
					>
						Change <span class="sr-only">email</span>
					</Button>
				{/if}
			</div>
			{#if pendingEmail}
				<Alert.Root variant="warning" role="status">
					<Alert.Description>
						Pending: {pendingEmail}. Follow the links sent to both inboxes to finish the switch.
					</Alert.Description>
				</Alert.Root>
			{/if}
			{#if openRow !== 'email' && emailResult?.emailSuccess}
				<p role="status" class="text-sm text-muted-foreground">{emailResult.emailSuccess}</p>
			{/if}
			{#if openRow === 'email'}
				<form method="POST" action="?/updateEmail" use:enhance={submitEmail} class="grid gap-3">
					{#if emailResult?.emailError && !emailErrorField}
						<Alert.Root variant="destructive">
							<Alert.Title>Email request not confirmed</Alert.Title>
							<Alert.Description>{emailResult.emailError}</Alert.Description>
						</Alert.Root>
					{/if}
					<div class="grid gap-3 sm:grid-cols-2">
						<Field.Root class="gap-1.5" data-invalid={emailErrorField === 'email' ? true : undefined}>
							<Field.Label for="email" class={ACCOUNT_FIELD_LABEL}>New email</Field.Label>
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
							{#if emailErrorField === 'email'}
								<Field.Error id="email-error">{emailResult?.emailError}</Field.Error>
							{/if}
						</Field.Root>
						<Field.Root class="gap-1.5" data-invalid={emailErrorField === 'password' ? true : undefined}>
							<Field.Label for="email-current-password" class={ACCOUNT_FIELD_LABEL}>Current password</Field.Label>
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
							{#if emailErrorField === 'password'}
								<Field.Error id="email-current-password-error">{emailResult?.emailError}</Field.Error>
							{/if}
						</Field.Root>
					</div>
					<p class="font-mono text-xs text-muted-foreground">Links go to both inboxes</p>
					{@render rowActions('Send confirmation', emailLoading, !emailMfaRequired, 'default')}
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
			{/if}
		</PageShell.FactRow>

		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label={ROWS.password.label}
			description={ROWS.password.description}
			data-account-row="password"
		>
			{#if completion}
				<PasswordCompletion
					state={completion}
					oncomplete={() => {
						completion = 'complete';
					}}
					onrestart={() => {
						completion = null;
						openRowFor('password');
					}}
				/>
			{:else if openRow !== 'password'}
				<div class="flex items-center gap-4">
					<p class="min-w-0 flex-1 font-mono text-[17px] tracking-[0.14em]" aria-label="Password set">••••••••••••</p>
					<Button
						bind:ref={rowTriggers.password}
						type="button"
						variant="outline"
						size="sm"
						onclick={() => openRowFor('password')}
					>
						Change <span class="sr-only">password</span>
					</Button>
				</div>
				<p class="font-mono text-xs text-muted-foreground">
					{PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters · upper, lower and a number
				</p>
			{:else if passwordMfaRequired}
				<PasswordMfaChallenge
					onverified={async () => {
						passwordMfaRequired = false;
						await focusFirstField('password');
					}}
				/>
			{:else}
				<form
					class="grid gap-3"
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
					<Field.Root class="gap-1.5" data-invalid={currentPasswordError ? true : undefined}>
						<Field.Label for="current-password" class={ACCOUNT_FIELD_LABEL}>Current password</Field.Label>
						<Input
							id="current-password"
							type="password"
							autocomplete="current-password"
							bind:value={currentPassword}
							disabled={passwordLoading}
						/>
						{#if currentPasswordError}<Field.Error>{currentPasswordError}</Field.Error>{/if}
					</Field.Root>
					<div class="grid gap-3 sm:grid-cols-2">
						<Field.Root class="gap-1.5">
							<Field.Label for="new-password" class={ACCOUNT_FIELD_LABEL}>New password</Field.Label>
							<Input
								id="new-password"
								type="password"
								autocomplete="new-password"
								aria-describedby="new-password-checklist"
								bind:value={newPassword}
								disabled={passwordLoading}
							/>
						</Field.Root>
						<Field.Root class="gap-1.5" data-invalid={confirmError ? true : undefined}>
							<Field.Label for="confirm-password" class={ACCOUNT_FIELD_LABEL}>Confirm new</Field.Label>
							<Input
								id="confirm-password"
								type="password"
								autocomplete="new-password"
								bind:value={confirmPassword}
								disabled={passwordLoading}
							/>
							{#if confirmError}<Field.Error>{confirmError}</Field.Error>{/if}
						</Field.Root>
					</div>
					<ul id="new-password-checklist" class="flex flex-wrap gap-x-4.5 gap-y-1.5 font-mono text-xs">
						{#each checklist as item (item.key)}
							<li
								class="flex items-center gap-1.5 {item.met ? 'text-foreground' : 'text-muted-foreground'}"
								aria-live={item.key === 'length' ? 'polite' : undefined}
								aria-atomic={item.key === 'length' ? 'true' : undefined}
							>
								{#if item.met}
									<Check class="size-3 text-success-foreground" aria-hidden="true" />
								{:else}
									<span class="mx-0.75 size-1.5 rounded-full border border-muted-foreground" aria-hidden="true"></span>
								{/if}
								<span class="sr-only">{item.met ? 'Met: ' : 'Needed: '}</span>{item.label}
							</li>
						{/each}
					</ul>
					{@render rowActions('Update password', passwordLoading, passwordReady, 'default')}
				</form>
			{/if}
		</PageShell.FactRow>

		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label={ROWS.twoFactor.label}
			description={ROWS.twoFactor.description}
			data-account-row="turn-off"
		>
			{#if mfaError}
				<Alert.Root variant="destructive">
					<Alert.Title>Security issue</Alert.Title>
					<Alert.Description>{mfaError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if mfaEnabled === null}
				<div class="flex flex-wrap items-center gap-4">
					<div class="grid min-w-0 flex-1 gap-1">
						<p class="font-heading text-[28px] leading-8 font-bold">Unavailable</p>
						<p class="text-sm text-muted-foreground">Unable to check your authenticator. Retry before changing MFA.</p>
					</div>
					<Button type="button" variant="outline" size="sm" onclick={retryMfaStatus} disabled={checkingMfaStatus}>
						{checkingMfaStatus ? 'Checking MFA status' : 'Retry MFA status'}
					</Button>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-4">
					<p class="flex min-w-0 flex-1 items-baseline gap-2.5">
						<span
							class="size-2 shrink-0 self-center rounded-full {mfaEnabled ? 'bg-success' : 'bg-muted-foreground/50'}"
							aria-hidden="true"
						></span>
						<span class="font-heading text-[28px] leading-8 font-bold">{mfaEnabled ? 'On' : 'Off'}</span>
						{#if mfaEnabled}<span class="text-[15px] text-muted-foreground">Authenticator app</span>{/if}
					</p>
					{#if mfaEnabled && openRow !== 'turn-off'}
						<Button
							bind:ref={rowTriggers['turn-off']}
							type="button"
							variant="destructive"
							size="sm"
							onclick={() => openRowFor('turn-off')}
						>
							Turn off
						</Button>
					{:else if !mfaEnabled}
						<Button bind:ref={turnOnLink} href={mfaSetupHref} size="sm">Turn on</Button>
					{/if}
				</div>
				{#if mfaSuccess}
					<p role="status" class="text-sm text-muted-foreground">{mfaSuccess}</p>
				{/if}
				{#if mfaEnabled && openRow === 'turn-off'}
					<form
						aria-labelledby="turn-off-title"
						class="grid gap-3.5 rounded-md border-l-3 border-l-destructive bg-destructive/5 p-4"
						onsubmit={(event) => {
							event.preventDefault();
							void disableMfa();
						}}
					>
						<div class="grid gap-1">
							<h2 id="turn-off-title" class="font-heading text-xl leading-6 font-bold">Turn off two-factor?</h2>
							<p class="text-sm text-muted-foreground">
								After this, your password alone opens your account. Enter a current code to confirm it's you.
							</p>
						</div>
						<CodeField
							bind:this={disableCodeField}
							id="disable-code"
							label="Authenticator code"
							size="compact"
							autofocus
							bind:value={disableCode}
							error={disableCodeError}
							disabled={disabling}
						/>
						<div class="flex flex-wrap gap-2">
							<Button type="button" variant="outline" size="sm" onclick={closeRow} disabled={disabling}>
								Keep it on
							</Button>
							<Button type="submit" variant="destructive" size="sm" disabled={disabling || disableCode.length !== 6}>
								{#if disabling}<Spinner />{/if}
								Turn off two-factor
							</Button>
						</div>
					</form>
				{:else if mfaEnabled}
					<p class="font-mono text-xs text-muted-foreground">Turning it off asks for a current code</p>
				{/if}
			{/if}
		</PageShell.FactRow>
	</PageShell.FactSection>
</div>
