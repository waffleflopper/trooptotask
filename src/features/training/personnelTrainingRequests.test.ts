import { describe, expect, it } from 'vitest';
import { trainingCertificateLink } from './personnelTrainingRequests';

const RECORD = '00000000-0000-4000-8000-000000006001';

describe('trainingCertificateLink', () => {
	it('opens an uploaded certificate through the app', () => {
		expect(
			trainingCertificateLink('org-1', 'history', RECORD, `org-1/personnel/p/training-certificates/a/card.pdf`)
		).toEqual({
			kind: 'stored',
			href: `/org/org-1/api/personnel-trainings/certificate?kind=history&id=${RECORD}`
		});
	});

	it('links a legacy certificate on another site directly and names that site', () => {
		expect(trainingCertificateLink('org-1', 'current', RECORD, 'https://records.example.test/cert.pdf')).toEqual({
			kind: 'external',
			href: 'https://records.example.test/cert.pdf',
			host: 'records.example.test'
		});
	});

	it('shows nothing when the completion has no certificate', () => {
		expect(trainingCertificateLink('org-1', 'current', RECORD, null)).toBeNull();
	});
});
