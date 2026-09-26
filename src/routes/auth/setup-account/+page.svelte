<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { passwordRequirements } from '$features/identity';

	let { data, form } = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let checkingStatus = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const requirements = $derived(passwordRequirements(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
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
	const canSubmit = $derived(
		showPasswordForm && !supportRequired && requirements.valid && passwordsMatch && !loading && !checkingStatus
	);
</script>

<svelte:head>
	<title>Set Up Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Reviewed Access"
	title="Set up your TroopToTask account."
	description="Use the setup link from your approval email to choose your password and activate your User Account."
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
					? `This setup link is approved for ${data.email}.`
					: 'Request a fresh setup link if your approval is still eligible.'}
	supportLabel="Account setup"
	supportTitle="One link, one account."
	supportDescription="Account Setup Links activate only your User Account. Organization membership is handled separately inside TroopToTask."
	supportPoints={supportRequired
		? ['A fresh setup link cannot finish while this attempt needs platform support.']
		: statusCheckAvailable
			? [
					'Check setup status before trying another password.',
					'A fresh link alone cannot resolve an unfinished setup attempt.'
				]
			: setupFinished
				? ['Sign in with the password you chose earlier.', 'Reset your password if you no longer know it.']
				: [
						'Choose your own password; TroopToTask never emails temporary passwords.',
						'Use the newest setup email if you requested more than one link.',
						'An expired link can be renewed, but a new link does not resolve an unfinished setup attempt.'
					]}
>
	<div class="flex flex-col gap-5">
		{#if supportRequired}
			<AuthNotice tone="error" title="Setup needs support" centered>
				<p>
					{form?.error ??
						('message' in data ? data.message : 'Contact platform support to resolve this setup attempt.')}
				</p>
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
						await update();
					};
				}}
			>
				<Button type="submit" disabled={loading} class="w-full">
					{#if loading}<Spinner />Checking setup...{:else}Check setup status{/if}
				</Button>
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
						await update();
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
					placeholder="At least 12 characters"
					hint="Use 12 to 72 characters with uppercase, lowercase, and a number."
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
						<span class="sr-only">{requirements.maxLength ? 'Met: ' : 'Needed: '}</span>72 characters or fewer
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
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					bind:value={confirmPassword}
					required
					placeholder="Repeat your password"
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				{#if confirmPassword && !passwordsMatch}
					<AuthNotice tone="error" message="Passwords do not match" />
				{/if}

				<Button type="submit" disabled={!canSubmit} class="w-full">
					{#if loading}
						<Spinner />
						Setting Up Account...
					{:else}
						Set Up Account
					{/if}
				</Button>
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
								await update();
							};
						}}
					>
						<Button type="submit" variant="outline" disabled={loading || checkingStatus} class="w-full">
							{#if checkingStatus}<Spinner />Checking setup...{:else}Check setup status{/if}
						</Button>
					</form>
				</div>
			{/if}
		{/if}

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Need help?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<p>Already set up? <a href={resolve('/auth/login')}>Sign in</a>.</p>
			{#if setupFinished}
				<p>Need a different password? <a href={resolve('/auth/forgot-password')}>Reset your password</a>.</p>
			{/if}
			{#if !supportRequired && showPasswordForm}
				<p>Need a new setup email? <a href={resolve('/auth/renew-invite')}>Request a fresh setup link</a>.</p>
			{/if}
			<p>Still waiting on approval? <a href={resolve('/auth/request-access')}>Request access</a>.</p>
		</div>
	</div>
</AuthShell>
