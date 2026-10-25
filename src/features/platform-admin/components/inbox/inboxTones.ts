/** The color role a kind's eyebrow carries in the queue and the detail. */
export const INBOX_TONES = {
	accent: { text: 'text-accent-text', tint: 'max-sm:bg-warning-muted' },
	info: { text: 'text-info-foreground', tint: 'max-sm:bg-info-muted' },
	danger: { text: 'text-danger-foreground', tint: 'max-sm:bg-danger-muted' }
} as const;

export type InboxTone = keyof typeof INBOX_TONES;
