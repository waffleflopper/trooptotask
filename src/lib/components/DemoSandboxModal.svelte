<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let creating = $state(false);
	let error = $state<string | null>(null);

	async function createSandbox() {
		creating = true;
		error = null;

		try {
			const res = await fetch('/api/create-demo-sandbox', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to create sandbox');
			}

			const { orgId } = await res.json();

			// Close modal and redirect to the sandbox org with full page reload
			// to ensure cookies are picked up properly
			onClose();
			window.location.href = `/org/${orgId}`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong';
			creating = false;
		}
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="sandbox-modal-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && !creating && onClose()}
>
	<button
		class="modal-backdrop"
		onclick={() => !creating && onClose()}
		tabindex="-1"
		aria-label="Close dialog"
	></button>
	<div class="modal" style="width: 450px;" role="document">
		<div class="modal-header">
			<h2 id="sandbox-modal-title">Try Editing</h2>
			{#if !creating}
				<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
			{/if}
		</div>

		<div class="modal-body">
			<div class="info-section">
				<div class="icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 19l7-7 3 3-7 7-3-3z" />
						<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
						<path d="M2 2l7.586 7.586" />
						<circle cx="11" cy="11" r="2" />
					</svg>
				</div>
				<p>
					You're viewing a <strong>read-only demo</strong>. To try editing, we'll create your own
					private sandbox with sample data.
				</p>
			</div>

			<div class="features">
				<div class="feature">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>Full editing access</span>
				</div>
				<div class="feature">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>Pre-loaded with sample data</span>
				</div>
				<div class="feature">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					<span>No sign-up required</span>
				</div>
				<div class="feature warning">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					<span>Expires after 1 hour</span>
				</div>
			</div>

			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			{#if !creating}
				<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			{/if}
			<button class="btn btn-primary" onclick={createSandbox} disabled={creating}>
				{#if creating}
					<span class="spinner"></span>
					Creating your sandbox...
				{:else}
					Create My Sandbox
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.info-section {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-start;
		margin-bottom: var(--spacing-lg);
	}

	.icon {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
		border-radius: var(--radius-lg);
		color: white;
	}

	.icon svg {
		width: 28px;
		height: 28px;
	}

	.info-section p {
		margin: 0;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.feature {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.feature svg {
		width: 20px;
		height: 20px;
		color: var(--color-success);
		flex-shrink: 0;
	}

	.feature.warning svg {
		color: var(--color-warning);
	}

	.feature span {
		font-size: var(--font-size-sm);
	}

	.error-message {
		padding: var(--spacing-sm);
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: var(--radius-md);
		color: #ef4444;
		font-size: var(--font-size-sm);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 0.8s linear infinite;
		margin-right: var(--spacing-sm);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
