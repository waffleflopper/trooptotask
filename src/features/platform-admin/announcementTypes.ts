export type PlatformAnnouncementType = 'info' | 'warning' | 'maintenance';

export interface PlatformAnnouncement {
	id: string;
	title: string;
	message: string;
	type: PlatformAnnouncementType;
	isActive: boolean;
	createdAt: string;
	expiresAt: string | null;
}

export interface PlatformAnnouncementCreateInput {
	title: string;
	message: string;
	type: PlatformAnnouncementType;
	expiresAt?: string | null;
}

export type PlatformAnnouncementSetActiveResult =
	| { status: 'updated'; id: string; isActive: boolean }
	| { status: 'not_found' };

export type PlatformAnnouncementValidation =
	| { valid: true; title: string; message: string; type: PlatformAnnouncementType; expiresAt?: string }
	| { valid: false; error: string };
