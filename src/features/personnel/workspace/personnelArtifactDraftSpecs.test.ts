import { describe, expect, it } from 'vitest';
import {
	counselingRecordDraftSpec,
	documentDraftSpec,
	followUpDraftSpec,
	leaderNoteDraftSpec
} from './personnelArtifactDraftSpecs';

describe('personnel artifact draft specs', () => {
	it('returns artifact-specific validation messages', () => {
		expect(followUpDraftSpec.validate({ title: '', notes: '', dueDate: '' })).toBe('Enter a follow-up title.');
		expect(leaderNoteDraftSpec.validate({ text: '' })).toBe('Enter a leader note before saving.');
		expect(documentDraftSpec.validate({ title: 'Orders', file: null })).toBe('Choose a PDF, JPEG, PNG, or HEIC file.');
		expect(documentDraftSpec.validate({ title: '', file: new File(['orders'], 'orders.pdf') })).toBe(
			'Enter a document title.'
		);
		expect(
			counselingRecordDraftSpec.validate({ dateConducted: '2026-05-20', title: 'Monthly', summary: '', file: null })
		).toBe('Choose a signed counseling PDF.');
		expect(
			counselingRecordDraftSpec.validate({
				dateConducted: '2026-05-20',
				title: '',
				summary: '',
				file: new File(['counseling'], 'monthly.pdf')
			})
		).toBe('Enter a counseling title.');
	});

	it('encodes follow-ups and leader notes as trimmed JSON submissions', () => {
		expect(followUpDraftSpec.endpoint({ orgId: 'org-1', personId: 'person-1' })).toBe(
			'/org/org-1/api/personnel/person-1/follow-ups'
		);
		expect(followUpDraftSpec.encode({ title: ' Packet review ', notes: ' Bring checklist ', dueDate: '' })).toEqual({
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Packet review', notes: 'Bring checklist', dueDate: null })
		});
		expect(leaderNoteDraftSpec.encode({ text: ' Strong range card prep ' })).toEqual({
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: 'Strong range card prep' })
		});
	});

	it('derives a document title from the selected file only while the title is blank', () => {
		const input = documentDraftSpec.createEmptyInput();

		documentDraftSpec.selectFile?.(input, new File(['card'], 'BLS_Card-2026.pdf', { type: 'application/pdf' }));

		expect(input.file?.name).toBe('BLS_Card-2026.pdf');
		expect(input.title).toBe('BLS Card 2026');

		documentDraftSpec.selectFile?.(input, new File(['orders'], 'orders.pdf', { type: 'application/pdf' }));

		expect(input.file?.name).toBe('orders.pdf');
		expect(input.title).toBe('BLS Card 2026');
	});

	it('encodes document uploads as multipart form data', () => {
		const file = new File(['card'], 'bls.pdf', { type: 'application/pdf' });
		const encoded = documentDraftSpec.encode({ title: ' BLS Card ', file });

		expect(encoded.headers).toBeUndefined();
		expect(encoded.body).toBeInstanceOf(FormData);
		expect((encoded.body as FormData).get('title')).toBe('BLS Card');
		expect((encoded.body as FormData).get('file')).toBe(file);
	});

	it('encodes counseling uploads as multipart form data and keeps the selected date after reset', () => {
		const file = new File(['counseling'], 'monthly.pdf', { type: 'application/pdf' });
		const input = {
			dateConducted: '2026-05-20',
			title: ' Monthly counseling ',
			summary: ' Goals reviewed ',
			file
		};
		const encoded = counselingRecordDraftSpec.encode(input);

		expect(encoded.body).toBeInstanceOf(FormData);
		expect((encoded.body as FormData).get('dateConducted')).toBe('2026-05-20');
		expect((encoded.body as FormData).get('title')).toBe('Monthly counseling');
		expect((encoded.body as FormData).get('summary')).toBe('Goals reviewed');
		expect((encoded.body as FormData).get('file')).toBe(file);
		expect(counselingRecordDraftSpec.reset?.(input)).toEqual({
			dateConducted: '2026-05-20',
			title: '',
			summary: '',
			file: null
		});
	});
});
