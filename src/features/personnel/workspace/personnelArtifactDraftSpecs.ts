import type {
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelFollowUp,
	PersonnelLeaderNote
} from '$features/personnel/personnel-detail.types';
import { derivePersonnelDocumentTitle } from '$features/personnel/utils/documentTitles';
import type { ArtifactDraftSpec } from './artifactDraft.svelte';

export interface FollowUpDraftInput {
	title: string;
	notes: string;
	dueDate: string;
}

export interface LeaderNoteDraftInput {
	text: string;
}

export interface DocumentDraftInput {
	title: string;
	file: File | null;
}

export interface CounselingRecordDraftInput {
	dateConducted: string;
	title: string;
	summary: string;
	file: File | null;
}

function todayIsoDate(): string {
	return new Date().toISOString().slice(0, 10);
}

export const followUpDraftSpec: ArtifactDraftSpec<FollowUpDraftInput, PersonnelFollowUp> = {
	createEmptyInput: () => ({ title: '', notes: '', dueDate: '' }),
	endpoint: ({ orgId, personId }) => `/org/${orgId}/api/personnel/${personId}/follow-ups`,
	validate: (input) => (input.title.trim() ? null : 'Enter a follow-up title.'),
	encode: (input) => ({
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			title: input.title.trim(),
			notes: input.notes.trim(),
			dueDate: input.dueDate || null
		})
	}),
	errorFallback: 'Unable to add follow-up.'
};

export const leaderNoteDraftSpec: ArtifactDraftSpec<LeaderNoteDraftInput, PersonnelLeaderNote> = {
	createEmptyInput: () => ({ text: '' }),
	endpoint: ({ orgId, personId }) => `/org/${orgId}/api/personnel/${personId}/leader-notes`,
	validate: (input) => (input.text.trim() ? null : 'Enter a leader note before saving.'),
	encode: (input) => ({
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text: input.text.trim() })
	}),
	errorFallback: 'Unable to save leader note.'
};

export const documentDraftSpec: ArtifactDraftSpec<DocumentDraftInput, PersonnelDocument> = {
	createEmptyInput: () => ({ title: '', file: null }),
	endpoint: ({ orgId, personId }) => `/org/${orgId}/api/personnel/${personId}/documents`,
	validate: (input) => {
		if (!input.file) return 'Choose a PDF, JPEG, PNG, or HEIC file.';
		if (!input.title.trim()) return 'Enter a document title.';
		return null;
	},
	encode: (input) => {
		const formData = new FormData();
		formData.set('title', input.title.trim());
		formData.set('file', input.file as File);
		return { body: formData };
	},
	errorFallback: 'Unable to upload document.',
	selectFile: (input, file) => {
		input.file = file;
		if (file && !input.title.trim()) {
			input.title = derivePersonnelDocumentTitle({ filename: file.name });
		}
	}
};

export const counselingRecordDraftSpec: ArtifactDraftSpec<CounselingRecordDraftInput, PersonnelCounselingRecord> = {
	createEmptyInput: () => ({ dateConducted: todayIsoDate(), title: '', summary: '', file: null }),
	endpoint: ({ orgId, personId }) => `/org/${orgId}/api/personnel/${personId}/counseling-records`,
	validate: (input) => {
		if (!input.file) return 'Choose a signed counseling PDF.';
		if (!input.title.trim()) return 'Enter a counseling title.';
		return null;
	},
	encode: (input) => {
		const formData = new FormData();
		formData.set('dateConducted', input.dateConducted);
		formData.set('title', input.title.trim());
		formData.set('summary', input.summary.trim());
		formData.set('file', input.file as File);
		return { body: formData };
	},
	errorFallback: 'Unable to upload counseling PDF.',
	reset: (input) => ({ dateConducted: input.dateConducted, title: '', summary: '', file: null }),
	selectFile: (input, file) => {
		input.file = file;
	}
};
