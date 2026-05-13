<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data }: { data: PageData } = $props();

	let mfaEnabled = $derived(data.hasMFA);
	let enrolling = $state(false);
	let qrCode = $state('');
	let factorId = $state('');
	let verifyCode = $state('');
	let error = $state('');
	let success = $state('');
	let loading = $state(false);
	let disabling = $state(false);
	let confirmingDisable = $state(false);
	let disableCode = $state('');

	async function startEnroll() {
		error = '';
		success = '';
		enrolling = true;
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/enroll', {
				method: 'POST'
			});

			const payload = (await response.json()) as { factorId?: string; qrCode?: string; error?: string };

			if (!response.ok || !payload.factorId || !payload.qrCode) {
				error = payload.error ?? 'Failed to start MFA enrollment';
				enrolling = false;
				return;
			}

			factorId = payload.factorId;
			qrCode = payload.qrCode;
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to start MFA enrollment';
			enrolling = false;
		} finally {
			loading = false;
		}
	}

	async function verifyEnrollment() {
		if (!verifyCode || verifyCode.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		error = '';
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/enroll/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					factorId,
					code: verifyCode
				})
			});

			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				error = payload.error ?? 'Verification failed';
				return;
			}

			success = 'MFA has been enabled successfully.';
			mfaEnabled = true;
			enrolling = false;
			qrCode = '';
			verifyCode = '';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Verification failed';
		} finally {
			loading = false;
		}
	}

	async function cancelEnroll() {
		if (factorId) {
			try {
				await fetch('/api/auth/mfa/enroll/cancel', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ factorId })
				});
			} catch {
				// Best effort cleanup; local state should still reset
			}
		}
		enrolling = false;
		qrCode = '';
		factorId = '';
		verifyCode = '';
		error = '';
	}

	async function disableMFA() {
		if (!disableCode || disableCode.length !== 6) {
			error = 'Please enter the 6-digit code from your authenticator app.';
			return;
		}

		error = '';
		success = '';
		disabling = true;
		try {
			const response = await fetch('/api/auth/mfa/disable', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: disableCode })
			});

			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				error = payload.error ?? 'Failed to disable MFA';
				return;
			}

			success = 'MFA has been disabled.';
			mfaEnabled = false;
			confirmingDisable = false;
			disableCode = '';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to disable MFA';
		} finally {
			disabling = false;
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
		error = '';
		success = '';
		confirmingDisable = true;
		disableCode = '';
	}

	function cancelDisableMFA() {
		confirmingDisable = false;
		disableCode = '';
		error = '';
	}
</script>

<svelte:head>
	<title>Account Security - Troop to Task</title>
</svelte:head>

<div class="security-page">
	<div class="security-container">
		<header class="page-header">
			<div class="header-copy">
				<p class="eyebrow">Account Controls</p>
				<h1>Account Security</h1>
				<p class="page-intro">Manage sign-in protection for your Troop to Task account.</p>
			</div>
			<Button href="/dashboard" variant="outline">Back to Dashboard</Button>
		</header>

		{#if error}
			<div class="alert alert-error">
				<p class="alert-label">Security Issue</p>
				<p>{error}</p>
			</div>
		{/if}
		{#if success}
			<div class="alert alert-success">
				<p class="alert-label">Security Updated</p>
				<p>{success}</p>
			</div>
		{/if}

		<div class="overview-strip">
			<div class="overview-card">
				<span class="overview-label">MFA</span>
				<strong class="overview-value">{mfaEnabled ? 'Enabled' : 'Disabled'}</strong>
				<span class="overview-meta"
					>{mfaEnabled
						? 'Account sign-in is protected with a second factor'
						: 'Only password-based sign-in is active right now'}</span
				>
			</div>
			<div class="overview-card">
				<span class="overview-label">Method</span>
				<strong class="overview-value">{enrolling ? 'TOTP Setup' : 'Authenticator App'}</strong>
				<span class="overview-meta">Use Google Authenticator, Authy, 1Password, or another TOTP-compatible app</span>
			</div>
		</div>

		<section class="security-section">
			<div class="section-heading">
				<p class="section-label">Two-Factor Authentication</p>
				<h2>Require an Authenticator Code at Sign-In</h2>
			</div>
			<p class="section-description">
				Add an extra layer of security to your account by requiring a verification code from your authenticator app when
				signing in.
			</p>

			<div class="mfa-status">
				<div class="status-indicator" class:enabled={mfaEnabled}>
					<span class="status-dot"></span>
					{mfaEnabled ? 'Enabled' : 'Disabled'}
				</div>
			</div>

			{#if !mfaEnabled && !enrolling}
				<Button onclick={startEnroll} disabled={loading}>
					{#if loading}<Spinner />{/if}
					Enable MFA
				</Button>
			{/if}

			{#if enrolling && qrCode}
				<div class="enroll-section">
					<div class="setup-panel">
						<div class="setup-copy">
							<p class="section-label">Setup In Progress</p>
							<h3>Scan the QR Code With Your Authenticator</h3>
							<p class="enroll-instructions">
								Use Google Authenticator, Authy, 1Password, or another compatible app, then enter the 6-digit code it
								generates to finish setup.
							</p>
						</div>

						<div class="qr-container">
							<img src={qrCode} alt="MFA QR Code" class="qr-code" />
						</div>
					</div>

					<form
						class="verify-form"
						onsubmit={(e) => {
							e.preventDefault();
							verifyEnrollment();
						}}
					>
						<div class="grid gap-2">
							<label class="field-label" for="verify-code">Verification Code</label>
							<Input
								id="verify-code"
								type="text"
								value={verifyCode}
								oninput={handleCodeInput}
								placeholder="000000"
								maxlength={6}
								autocomplete="one-time-code"
								inputmode="numeric"
							/>
						</div>
						<div class="enroll-actions">
							<Button type="button" variant="outline" onclick={cancelEnroll}>Cancel</Button>
							<Button type="submit" disabled={loading || verifyCode.length !== 6}>
								{#if loading}<Spinner />{/if}
								Verify & Enable
							</Button>
						</div>
					</form>
				</div>
			{/if}

			{#if mfaEnabled && !enrolling && !confirmingDisable}
				<Button variant="destructive" onclick={startDisableMFA} disabled={disabling}>Disable MFA</Button>
			{/if}

			{#if mfaEnabled && confirmingDisable}
				<form
					class="verify-form disable-form"
					onsubmit={(e) => {
						e.preventDefault();
						disableMFA();
					}}
				>
					<div class="setup-copy">
						<p class="section-label">Disable Protection</p>
						<h3>Confirm With Your Authenticator Code</h3>
						<p class="enroll-instructions">
							Enter a fresh 6-digit code from your authenticator app before MFA can be removed from this account.
						</p>
					</div>
					<div class="grid gap-2">
						<label class="field-label" for="disable-code">Authenticator Code</label>
						<Input
							id="disable-code"
							type="text"
							value={disableCode}
							oninput={handleDisableCodeInput}
							placeholder="000000"
							maxlength={6}
							autocomplete="one-time-code"
							inputmode="numeric"
						/>
					</div>
					<div class="enroll-actions">
						<Button type="button" variant="outline" onclick={cancelDisableMFA} disabled={disabling}>
							Keep MFA Enabled
						</Button>
						<Button type="submit" variant="destructive" disabled={disabling || disableCode.length !== 6}>
							{#if disabling}<Spinner />{/if}
							Confirm & Disable
						</Button>
					</div>
				</form>
			{/if}
		</section>
	</div>
</div>

<style>
	.security-page {
		min-height: 100vh;
		background: var(--background);
		padding: 1.5rem;
	}

	.security-container {
		max-width: 860px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.header-copy {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.eyebrow,
	.section-label,
	.alert-label,
	.overview-label,
	.field-label {
		margin: 0;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.eyebrow,
	.section-label {
		color: var(--accent);
	}

	.field-label {
		color: var(--muted-foreground);
	}

	.page-header h1 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.page-intro {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 1rem;
		line-height: 1.55;
	}

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
	}

	.overview-value {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.overview-meta {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--muted-foreground);
	}

	.security-section {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.security-section h2 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.section-description {
		color: var(--muted-foreground);
		font-size: 1rem;
		margin: 0;
		line-height: 1.6;
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
	}

	.status-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--muted);
	}

	.status-indicator.enabled .status-dot {
		background: var(--chart-2);
	}

	.status-indicator.enabled {
		color: var(--chart-2);
		background: color-mix(in srgb, var(--chart-2) 12%, var(--card));
	}

	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.alert p {
		margin: 0;
	}

	.alert-error {
		background: color-mix(in srgb, var(--destructive) 12%, var(--card));
		color: var(--destructive);
	}

	.alert-success {
		background: color-mix(in srgb, var(--chart-2) 12%, var(--card));
		color: var(--chart-2);
	}

	.enroll-section {
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.setup-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1.25rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--muted) 68%, var(--card) 32%);
	}

	.setup-copy {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.security-section h3 {
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		line-height: 0.98;
		text-transform: uppercase;
		color: var(--foreground);
		margin: 0;
	}

	.enroll-instructions {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		margin: 0;
		line-height: 1.6;
	}

	.qr-container {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.qr-code {
		width: 200px;
		height: 200px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--card);
		padding: 0.5rem;
	}

	.verify-form {
		max-width: 360px;
	}

	.disable-form {
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.enroll-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	@media (max-width: 720px) {
		.security-page {
			padding: 1rem;
		}

		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.setup-panel {
			grid-template-columns: 1fr;
		}

		.enroll-actions {
			flex-direction: column-reverse;
		}

		.enroll-actions :global([data-slot='button']),
		.page-header :global([data-slot='button']) {
			width: 100%;
		}
	}
</style>
