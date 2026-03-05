<script lang="ts">
	import { demoModeStore } from '$lib/stores/demoMode.svelte';

	function handleTryEditing() {
		demoModeStore.requestEdit();
	}
</script>

{#if demoModeStore.isReadOnly}
	<div class="demo-banner">
		<div class="banner-content">
			<span class="banner-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="16" x2="12" y2="12" />
					<line x1="12" y1="8" x2="12.01" y2="8" />
				</svg>
			</span>
			<span class="banner-text">
				You're viewing a <strong>read-only demo</strong>. Changes won't be saved.
			</span>
			<button class="try-editing-btn" onclick={handleTryEditing}>
				Try Editing
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="5" y1="12" x2="19" y2="12" />
					<polyline points="12 5 19 12 12 19" />
				</svg>
			</button>
		</div>
	</div>
{:else if demoModeStore.isSandbox}
	<div class="demo-banner sandbox">
		<div class="banner-content">
			<span class="banner-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
			</span>
			<span class="banner-text">
				<strong>Demo Sandbox</strong> - You have full access. This sandbox expires in ~1 hour.
			</span>
		</div>
	</div>
{/if}

<style>
	.demo-banner {
		background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
		color: white;
		padding: var(--spacing-sm) var(--spacing-lg);
		position: fixed;
		top: var(--header-height, 56px);
		left: 0;
		width: 100%;
		z-index: 99;
		box-sizing: border-box;
	}

	.demo-banner.sandbox {
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
	}

	.banner-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		max-width: 1200px;
		margin: 0 auto;
	}

	.banner-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.banner-icon svg {
		width: 20px;
		height: 20px;
	}

	.banner-text {
		font-size: var(--font-size-sm);
	}

	.try-editing-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: var(--radius-md);
		color: white;
		font-size: var(--font-size-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		text-decoration: none;
	}

	.try-editing-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.try-editing-btn svg {
		width: 16px;
		height: 16px;
	}

	@media (max-width: 640px) {
		.banner-content {
			flex-wrap: wrap;
			text-align: center;
		}

		.banner-text {
			width: 100%;
		}
	}
</style>
