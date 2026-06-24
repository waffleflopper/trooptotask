// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { TIER_CONFIG } from '$lib/types/subscription';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

function renderTermsPage() {
	return render(Page, {
		props: {
			data: { session: null, user: null }
		}
	});
}

function formatMonthlyPrice(cents: number): string {
	return `$${(cents / 100).toFixed(2)}/month`;
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

describe('terms page contact', () => {
	it('links to the canonical support mailbox', () => {
		renderTermsPage();

		expect(screen.getByRole('link', { name: 'support@trooptotask.org' }).getAttribute('href')).toBe(
			'mailto:support@trooptotask.org'
		);
	});

	it('keeps paid launch plan pricing and caps aligned with the tier config', () => {
		renderTermsPage();

		const termsText = normalizeText(document.body.textContent ?? '');
		const team = TIER_CONFIG.team;
		const unit = TIER_CONFIG.unit;

		expect(termsText).toContain(
			`${team.name} is ${formatMonthlyPrice(team.priceMonthly)} for up to ${team.personnelCap} personnel and ${team.bulkExportsPerMonth} exports per month`
		);
		expect(termsText).toContain(
			`${unit.name} is ${formatMonthlyPrice(unit.priceMonthly)} for up to ${unit.personnelCap} personnel and unlimited exports`
		);
	});
});
