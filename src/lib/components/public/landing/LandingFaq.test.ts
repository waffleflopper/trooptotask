// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import LandingFaq from './LandingFaq.svelte';

afterEach(cleanup);

function answerFor(trigger: HTMLElement) {
	return document.getElementById(trigger.getAttribute('aria-controls') ?? '');
}

describe('landing FAQ', () => {
	it('starts with every answer hidden', () => {
		render(LandingFaq);

		for (const trigger of screen.getAllByRole('button')) {
			expect(trigger).toHaveAttribute('aria-expanded', 'false');
			expect(answerFor(trigger)).toHaveAttribute('hidden');
		}
	});

	it('closes the open answer when another one opens', async () => {
		render(LandingFaq);
		const [first, second] = screen.getAllByRole('button');

		await fireEvent.click(first);
		expect(first).toHaveAttribute('aria-expanded', 'true');
		expect(answerFor(first)).not.toHaveAttribute('hidden');

		await fireEvent.click(second);
		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(answerFor(first)).toHaveAttribute('hidden');
		expect(second).toHaveAttribute('aria-expanded', 'true');
		expect(answerFor(second)).not.toHaveAttribute('hidden');
	});

	it('closes the open answer when its question is clicked again', async () => {
		render(LandingFaq);
		const [first] = screen.getAllByRole('button');

		await fireEvent.click(first);
		await fireEvent.click(first);

		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(answerFor(first)).toHaveAttribute('hidden');
	});
});
