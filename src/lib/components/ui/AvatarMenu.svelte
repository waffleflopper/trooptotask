<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import OverflowMenu from './OverflowMenu.svelte';
	import type { OverflowItem } from './OverflowMenu.types';

	interface OrgInfo {
		id: string;
		name: string;
		role: string;
	}

	interface Props {
		orgId: string;
		orgName: string;
		userRole: string;
		allOrgs?: OrgInfo[];
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		onFeedback?: () => void;
		onWhatsNew?: () => void;
		menuAlign?: 'left' | 'right';
		menuSide?: 'bottom' | 'top';
	}

	let {
		orgId,
		orgName,
		userRole,
		allOrgs = [],
		onToggleTheme,
		isDarkTheme,
		onFeedback,
		onWhatsNew,
		menuAlign = 'right',
		menuSide = 'bottom'
	}: Props = $props();

	let menuOpen = $state(false);

	const initial = $derived(orgName ? orgName.charAt(0).toUpperCase() : '?');

	const isMultiOrg = $derived(allOrgs.length > 1);

	const items = $derived.by(() => {
		const result: OverflowItem[] = [];

		// 1. Org name + role as non-clickable header
		result.push({ label: '', group: `${orgName} · ${userRole}`, disabled: true });

		// 2. Divider
		result.push({ label: '', divider: true });

		// 3. Org switcher (only if multi-org)
		if (isMultiOrg) {
			for (const org of allOrgs) {
				const isActive = org.id === orgId;
				result.push({
					label: org.name,
					toggle: true,
					active: isActive,
					onclick: () => {
						if (!isActive) {
							// Preserve the current page path suffix after /org/{orgId}
							const pathname = $page.url.pathname;
							const orgPrefix = `/org/${orgId}`;
							const suffix = pathname.startsWith(orgPrefix) ? pathname.slice(orgPrefix.length) : '';
							goto(`/org/${org.id}${suffix}`);
						}
					}
				});
			}

			// 4. Manage Organizations
			result.push({ label: 'Manage Organizations', href: '/dashboard?show=all' });

			// 5. Divider after multi-org section
			result.push({ label: '', divider: true });
		}

		// 6. Org Settings
		result.push({ label: 'Org Settings', href: `/org/${orgId}/settings` });

		// 7. Theme toggle
		result.push({
			label: isDarkTheme ? 'Light Mode' : 'Dark Mode',
			toggle: true,
			active: isDarkTheme,
			onclick: onToggleTheme
		});

		// 9. What's New
		if (onWhatsNew) {
			result.push({ label: "What's New", onclick: onWhatsNew });
		}

		// 10. Feedback
		if (onFeedback) {
			result.push({ label: 'Send Feedback', onclick: onFeedback });
		}

		// 11. Help
		result.push({ label: 'Help', href: '/help' });

		// 12. Divider
		result.push({ label: '', divider: true });

		// 13. Sign Out
		result.push({ label: 'Sign Out', href: '/auth/logout', danger: true });

		return result;
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<div class="avatar-menu-wrapper">
	<button
		class="avatar-circle"
		class:open={menuOpen}
		type="button"
		onclick={toggleMenu}
		aria-label="Account menu"
		aria-expanded={menuOpen}
		aria-haspopup="menu"
	>
		{initial}
	</button>

	<OverflowMenu {items} open={menuOpen} onClose={closeMenu} align={menuAlign} side={menuSide} />
</div>

<style>
	.avatar-menu-wrapper {
		position: relative;
	}

	.avatar-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.25rem;
		height: 2.25rem;
		padding: 0 0.7rem;
		border-radius: var(--radius-md);
		background: rgba(240, 239, 233, 0.03);
		color: var(--color-chrome-text);
		font-family: var(--font-mono);
		font-weight: var(--font-weight-medium);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		line-height: 1;
		border: 1px solid var(--color-chrome-border);
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast),
			color var(--transition-fast);
		user-select: none;
	}

	.avatar-circle:hover {
		color: var(--color-chrome-text);
		border-color: rgba(240, 239, 233, 0.16);
		background: rgba(240, 239, 233, 0.06);
	}

	.avatar-circle.open {
		color: var(--color-chrome-active);
		border-color: rgba(var(--amber-rgb), 0.42);
		background: rgba(var(--amber-rgb), 0.08);
	}
</style>
