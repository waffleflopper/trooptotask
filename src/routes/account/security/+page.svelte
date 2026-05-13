<script lang="ts">
	import type { PageData } from './$types';
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
			<a href="/dashboard" class="btn btn-secondary">Back to Dashboard</a>
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
				<button class="btn btn-primary" onclick={startEnroll} disabled={loading}>
					{#if loading}<Spinner />{/if}
					Enable MFA
				</button>
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
						<div class="form-group">
							<label class="label" for="verify-code">Verification Code</label>
							<input
								id="verify-code"
								type="text"
								class="input code-input"
								value={verifyCode}
								oninput={handleCodeInput}
								placeholder="000000"
								maxlength="6"
								autocomplete="one-time-code"
								inputmode="numeric"
							/>
						</div>
						<div class="enroll-actions">
							<button type="button" class="btn btn-secondary" onclick={cancelEnroll}>Cancel</button>
							<button type="submit" class="btn btn-primary" disabled={loading || verifyCode.length !== 6}>
								{#if loading}<Spinner />{/if}
								Verify & Enable
							</button>
						</div>
					</form>
				</div>
			{/if}

			{#if mfaEnabled && !enrolling && !confirmingDisable}
				<button class="btn btn-danger" onclick={startDisableMFA} disabled={disabling}> Disable MFA </button>
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
					<div class="form-group">
						<label class="label" for="disable-code">Authenticator Code</label>
						<input
							id="disable-code"
							type="text"
							class="input code-input"
							value={disableCode}
							oninput={handleDisableCodeInput}
							placeholder="000000"
							maxlength="6"
							autocomplete="one-time-code"
							inputmode="numeric"
						/>
					</div>
					<div class="enroll-actions">
						<button type="button" class="btn btn-secondary" onclick={cancelDisableMFA} disabled={disabling}>
							Keep MFA Enabled
						</button>
						<button type="submit" class="btn btn-danger" disabled={disabling || disableCode.length !== 6}>
							{#if disabling}<Spinner />{/if}
							Confirm & Disable
						</button>
					</div>
				</form>
			{/if}
		</section>
	</div>
</div>

<style>
	.security-page {
		min-height: 100vh;
		background: var(--surface-page);
		padding: var(--sp-6);
	}

	.security-container {
		max-width: 860px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.header-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.eyebrow,
	.section-label,
	.alert-label,
	.overview-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.eyebrow,
	.section-label {
		color: var(--amber);
	}

	.page-header h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.page-intro {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-base);
		line-height: 1.55;
	}

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--sp-3);
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.overview-value {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.overview-meta {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.security-section {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.security-section h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.section-description {
		color: var(--text-secondary);
		font-size: var(--text-base);
		margin: 0;
		line-height: 1.6;
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.status-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--text-muted);
	}

	.status-indicator.enabled .status-dot {
		background: var(--success);
	}

	.status-indicator.enabled {
		color: var(--success);
		background: color-mix(in srgb, var(--success-bg) 82%, var(--surface-panel) 18%);
	}

	.alert {
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		border: var(--border-thin);
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.alert p {
		margin: 0;
	}

	.alert-error {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		color: var(--danger);
	}

	.alert-success {
		background: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
		color: var(--success);
	}

	.enroll-section {
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.setup-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-5);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.setup-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.security-section h3 {
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 0.98;
		text-transform: uppercase;
		color: var(--text-strong);
		margin: 0;
	}

	.enroll-instructions {
		color: var(--text-secondary);
		font-size: var(--text-sm);
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
		border-radius: var(--radius-md);
		border: var(--border-thin);
		background: var(--surface-panel);
		padding: var(--sp-2);
	}

	.verify-form {
		max-width: 360px;
	}

	.disable-form {
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.code-input {
		font-family: var(--font-mono);
		font-size: var(--text-xl);
		letter-spacing: 0.18em;
		text-align: center;
	}

	.enroll-actions {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	@media (max-width: 720px) {
		.security-page {
			padding: var(--sp-4);
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

		.enroll-actions :global(.btn),
		.page-header :global(.btn) {
			width: 100%;
		}
	}
</style>
