<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PASSWORD_MISMATCH_MESSAGE, passwordRequirements } from '$features/identity';
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthPasswordToggle from '$features/identity/AuthPasswordToggle.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';

	let { data, form } = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let checkingStatus = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const requirements = $derived(passwordRequirements(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const confirmError = $derived(confirmPassword && !passwordsMatch ? PASSWORD_MISMATCH_MESSAGE : undefined);
	const recoveryState = $derived(
		data.state === 'valid' ||
			data.state === 'recovery-available' ||
			form?.recoveryState === 'recovered' ||
			form?.recoveryState === 'fresh-link-required'
			? (form?.recoveryState ?? data.state)
			: data.state
	);
	const statusCheckAvailable = $derived(recoveryState === 'recovery-available');
	const recovered = $derived(recoveryState === 'recovered');
	const setupFinished = $derived(recovered || recoveryState === 'used' || recoveryState === 'completed');
	const showPasswordForm = $derived(recoveryState === 'valid' || recoveryState === 'retry-password');
	const supportRequired = $derived(
		data.state === 'claimed' || data.state === 'support-required' || form?.supportRequired === true
	);
	const invitedTo = $derived(data.state === 'valid' || data.state === 'recovery-available' ? data.invitedTo : null);
	const canSubmit = $derived(
		showPasswordForm && !supportRequired && requirements.valid && passwordsMatch && !loading && !checkingStatus
	);
</script>

<svelte:head>
	<title>Set Up Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow={invitedTo ? 'Unit invitation' : 'Reviewed Access'}
	headline={invitedTo ? [`${invitedTo} invited you.`, 'Set it up.'] : ["You're approved.", 'Set it up.']}
	lede={invitedTo
		? 'Choose your own password. Then sign in and accept the invitation from your Dashboard.'
		: 'Choose your own password and your User Account is ready. Unit membership comes next, inside TroopToTask.'}
	steps={{
		label: 'Account setup',
		items: [
			invitedTo
				? { title: 'Invitation sent', detail: 'Your unit added this email.', state: 'done' }
				: { title: 'Request approved', detail: 'A person reviewed it.', state: 'done' },
			{
				title: 'Choose a password',
				detail: 'TroopToTask never emails one.',
				state: setupFinished ? 'done' : 'current'
			},
			{
				title: 'Sign in',
				detail: invitedTo ? 'Then accept the invitation.' : 'Then join your unit.',
				state: setupFinished ? 'current' : 'upcoming'
			}
		]
	}}
	alternatives={[
		{ prompt: 'Already set up?', label: 'Sign in', href: resolve('/auth/login') },
		...(setupFinished
			? [{ prompt: 'Need a different password?', label: 'Reset your password', href: resolve('/auth/forgot-password') }]
			: []),
		...(!supportRequired && showPasswordForm
			? [
					{
						prompt: 'Need a new setup email?',
						label: 'Request a fresh setup link',
						href: resolve('/auth/renew-invite')
					}
				]
			: []),
		...(invitedTo
			? []
			: [{ prompt: 'Still waiting on approval?', label: 'Request access', href: resolve('/auth/request-access') }])
	]}
	panelEyebrow="Account setup"
	panelTitle={supportRequired
		? 'Setup needs support'
		: statusCheckAvailable
			? 'Check your setup status'
			: setupFinished
				? 'Account setup complete'
				: showPasswordForm
					? 'Choose your password'
					: 'Setup link unavailable'}
	panelDescription={supportRequired
		? 'Contact platform support to resolve this setup attempt.'
		: statusCheckAvailable
			? 'Your earlier setup attempt may still be finishing. Check its status before choosing another password.'
			: setupFinished
				? 'Continue by signing in with the password you chose.'
				: showPasswordForm && 'email' in data
					? `This setup link is ${invitedTo ? 'for' : 'approved for'} ${data.email}.`
					: 'Request a fresh setup link if your approval is still eligible.'}
>
	<div class="flex flex-col gap-5">
		{#if supportRequired}
			<AuthNotice tone="error" title="Setup needs support" centered>
				<p>
					{form?.error ??
						('message' in data ? data.message : 'Contact platform support to resolve this setup attempt.')}
				</p>
				<p>A fresh setup link cannot finish while this attempt needs platform support.</p>
			</AuthNotice>
		{:else if statusCheckAvailable}
			{#if form?.error}<AuthNotice tone="error" message={form.error} />{/if}
			<AuthNotice
				tone="info"
				title="Setup status"
				message={form?.message ?? 'Check whether your earlier setup finished before trying another password.'}
			/>
			<form
				method="POST"
				action="?/recover"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update({ navigate: false });
					};
				}}
			>
				<AuthButton {loading} loadingLabel="Checking setup...">Check setup status</AuthButton>
			</form>
		{:else if setupFinished}
			<AuthNotice
				tone="success"
				title="Account setup complete"
				message={recovered
					? (form?.message ?? ('message' in data ? data.message : 'Your account setup is complete.'))
					: 'message' in data
						? data.message
						: 'Your account setup is complete.'}
				centered
			/>
		{:else if !showPasswordForm}
			<AuthNotice tone="error" title="Setup link unavailable" centered>
				<p>{form?.message ?? form?.error ?? ('message' in data ? data.message : 'This setup link is unavailable.')}</p>
				<p><a href={resolve('/auth/renew-invite')}>Request a fresh setup link</a>.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}
			{#if recoveryState === 'retry-password' && form?.message}
				<AuthNotice tone="info" message={form.message} />
			{/if}

			<form
				method="POST"
				action="?/complete"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update({ navigate: false });
					};
				}}
				class="flex flex-col gap-5"
			>
				<AuthField label="Email Address" id="email" name="email" type="email" value={data.email} disabled />

				<AuthField
					label="Password"
					id="password"
					name="password"
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
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					error={confirmError}
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				<AuthButton disabled={!canSubmit} {loading} loadingLabel="Setting Up Account...">Set Up Account</AuthButton>
			</form>
			{#if recoveryState === 'valid'}
				<div class="flex flex-col gap-2 border-t border-border pt-4">
					<p class="text-sm leading-relaxed text-muted-foreground">
						Did an earlier setup stop without a result? Check its status before trying another password.
					</p>
					<form
						method="POST"
						action="?/recover"
						use:enhance={() => {
							checkingStatus = true;
							return async ({ update }) => {
								checkingStatus = false;
								await update({ navigate: false });
							};
						}}
					>
						<Button type="submit" variant="outline" disabled={loading || checkingStatus} class="h-11 w-full">
							{#if checkingStatus}<Spinner />Checking setup...{:else}Check setup status{/if}
						</Button>
					</form>
				</div>
			{/if}
		{/if}
	</div>
</AuthShell>
