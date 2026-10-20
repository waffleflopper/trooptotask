// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Dropzone } from './index.js';

afterEach(() => {
	cleanup();
});

const pdf = new File(['%PDF'], 'da4856.pdf', { type: 'application/pdf' });
const png = new File(['png'], 'scan.png', { type: 'image/png' });

function mount(props: { error?: string } = {}) {
	const offered: File[][] = [];
	render(Dropzone, {
		props: {
			title: 'Drop files to upload',
			hint: 'PDF, JPG, PNG or HEIC up to 10 MB.',
			accept: 'application/pdf',
			onFiles: (files: File[]) => offered.push(files),
			...props
		}
	});
	return { offered, zone: screen.getByText('Drop files to upload').closest('label') as HTMLElement };
}

describe('patterns/dropzone', () => {
	it('hands every dropped file to its owner', async () => {
		const { offered, zone } = mount();

		await fireEvent.drop(zone, { dataTransfer: { files: [pdf, png], types: ['Files'] } });

		expect(offered).toEqual([[pdf, png]]);
	});

	it('hands over a picked file and clears the input so the same file can be picked again', async () => {
		const { offered } = mount();
		const input = screen.getByLabelText(/Drop files to upload/) as HTMLInputElement;

		await fireEvent.change(input, { target: { files: [pdf] } });

		expect(offered).toEqual([[pdf]]);
		expect(input.value).toBe('');
	});

	it('announces an error beside the zone and marks the input invalid', () => {
		mount({ error: 'notes.txt is not a PDF.' });

		expect(screen.getByRole('alert').textContent).toBe('notes.txt is not a PDF.');
		expect((screen.getByLabelText(/Drop files to upload/) as HTMLInputElement).getAttribute('aria-invalid')).toBe(
			'true'
		);
	});
});
