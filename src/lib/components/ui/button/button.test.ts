// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ButtonTest from './ButtonTest.svelte';

afterEach(cleanup);

describe('Button', () => {
	it('submits a form only when asked to', async () => {
		render(ButtonTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
		expect(screen.getByLabelText('Submissions')).toHaveTextContent('0');

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByLabelText('Submissions')).toHaveTextContent('1');
	});

	it('renders an href as a link and a disabled link as unreachable', () => {
		render(ButtonTest);

		expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports');

		const disabled = screen.getByRole('link', { name: 'Exports' });
		expect(disabled).not.toHaveAttribute('href');
		expect(disabled).toHaveAttribute('aria-disabled', 'true');
		expect(disabled).toHaveAttribute('tabindex', '-1');
	});
});
