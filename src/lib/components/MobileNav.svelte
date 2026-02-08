<script lang="ts">
	interface Props {
		clinicId: string;
		onClose: () => void;
		onShowLongRangeView: () => void;
		onShowAssignmentPlanner: () => void;
		onShowBulkStatus: () => void;
		onShowTodayBreakdown: () => void;
		onShowStatusManager: () => void;
		onShowSpecialDayManager: () => void;
		onToggleTheme: () => void;
		isDarkTheme: boolean;
	}

	let {
		clinicId,
		onClose,
		onShowLongRangeView,
		onShowAssignmentPlanner,
		onShowBulkStatus,
		onShowTodayBreakdown,
		onShowStatusManager,
		onShowSpecialDayManager,
		onToggleTheme,
		isDarkTheme
	}: Props = $props();

	function handleNavClick(action: () => void) {
		action();
		onClose();
	}
</script>

<div class="mobile-nav-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true">
	<nav class="mobile-nav" onclick={(e) => e.stopPropagation()}>
		<div class="nav-header">
			<h2>Menu</h2>
			<button class="close-btn" onclick={onClose} aria-label="Close menu">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div class="nav-section">
			<h3>Navigation</h3>
			<a href="/clinic/{clinicId}/personnel" class="nav-item" onclick={onClose}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				Personnel
			</a>
			<a href="/clinic/{clinicId}/training" class="nav-item" onclick={onClose}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
					<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
				</svg>
				Training
			</a>
		</div>

		<div class="nav-section">
			<h3>Views & Tools</h3>
			<button class="nav-item" onclick={() => handleNavClick(onShowLongRangeView)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
				3-Month View
			</button>
			<button class="nav-item" onclick={() => handleNavClick(onShowAssignmentPlanner)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
				</svg>
				Assignments
			</button>
			<button class="nav-item" onclick={() => handleNavClick(onShowBulkStatus)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 11 12 14 22 4" />
					<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
				</svg>
				Bulk Status
			</button>
			<button class="nav-item highlight" onclick={() => handleNavClick(onShowTodayBreakdown)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
				Today's Breakdown
			</button>
		</div>

		<div class="nav-section">
			<h3>Settings</h3>
			<button class="nav-item" onclick={() => handleNavClick(onShowStatusManager)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
				Status Types
			</button>
			<button class="nav-item" onclick={() => handleNavClick(onShowSpecialDayManager)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
				</svg>
				Holidays
			</button>
			<a href="/clinic/{clinicId}/settings" class="nav-item" onclick={onClose}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
				Settings
			</a>
			<button class="nav-item" onclick={onToggleTheme}>
				{#if isDarkTheme}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5" />
						<line x1="12" y1="1" x2="12" y2="3" />
						<line x1="12" y1="21" x2="12" y2="23" />
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
						<line x1="1" y1="12" x2="3" y2="12" />
						<line x1="21" y1="12" x2="23" y2="12" />
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
					</svg>
					Light Mode
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
					</svg>
					Dark Mode
				{/if}
			</button>
		</div>

		<div class="nav-footer">
			<a href="/auth/logout" class="nav-item logout">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
				Sign Out
			</a>
		</div>
	</nav>
</div>

<style>
	.mobile-nav-overlay {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.mobile-nav {
		position: fixed;
		top: 0;
		right: 0;
		width: 280px;
		max-width: 85vw;
		height: 100%;
		background: var(--color-surface);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		animation: slideIn 0.2s ease;
		overflow-y: auto;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.nav-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-primary);
		color: white;
	}

	.nav-header h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		transition: background 0.15s ease;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.close-btn svg {
		width: 20px;
		height: 20px;
	}

	.nav-section {
		padding: var(--spacing-md) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.nav-section h3 {
		padding: 0 var(--spacing-lg);
		margin-bottom: var(--spacing-sm);
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--color-text-muted);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: var(--font-size-base);
		color: var(--color-text);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
		min-height: 44px; /* Touch target */
	}

	.nav-item:hover {
		background: var(--color-bg);
	}

	.nav-item svg {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.nav-item.highlight {
		background: var(--color-secondary);
		color: white;
		margin: var(--spacing-xs) var(--spacing-md);
		border-radius: var(--radius-md);
		width: calc(100% - var(--spacing-lg));
	}

	.nav-item.highlight svg {
		color: white;
	}

	.nav-item.highlight:hover {
		filter: brightness(1.1);
	}

	.nav-footer {
		margin-top: auto;
		padding: var(--spacing-md) 0;
		border-top: 1px solid var(--color-border);
	}

	.nav-item.logout {
		color: #dc2626;
	}

	.nav-item.logout svg {
		color: #dc2626;
	}

	.nav-item.logout:hover {
		background: rgba(220, 38, 38, 0.1);
	}
</style>
