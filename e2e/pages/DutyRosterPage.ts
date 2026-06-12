import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface DutyRosterTemplateInput {
	name: string;
	slug: string;
	shortCode: string;
}

export class DutyRosterPage {
	readonly page: Page;
	readonly newTemplateButton: Locator;
	readonly templateNameInput: Locator;
	readonly routeSlugInput: Locator;
	readonly shortCodeInput: Locator;
	readonly continueButton: Locator;
	readonly saveTemplateButton: Locator;
	readonly generatePreviewButton: Locator;
	readonly generatedPreviewTable: Locator;
	readonly acceptAndApplyButton: Locator;
	readonly acceptedRunRecord: Locator;
	readonly acceptedRunList: Locator;

	constructor(page: Page) {
		this.page = page;
		this.newTemplateButton = page.getByRole('link', { name: 'New Template' });
		this.templateNameInput = page.getByRole('textbox', { name: 'Template name' });
		this.routeSlugInput = page.getByRole('textbox', { name: 'Route slug' });
		this.shortCodeInput = page.getByRole('textbox', { name: 'Short code' });
		this.continueButton = page.getByRole('button', { name: 'Continue' });
		this.saveTemplateButton = page.getByRole('button', { name: 'Save Template' });
		this.generatePreviewButton = page.getByRole('button', { name: 'Generate Preview' });
		this.generatedPreviewTable = page.getByRole('table', { name: 'Generated Duty Roster preview' });
		this.acceptAndApplyButton = page.getByRole('button', { name: 'Accept + Apply to Calendar' });
		this.acceptedRunRecord = page.getByLabel('Accepted Duty Roster record');
		this.acceptedRunList = page.getByRole('table', { name: 'Accepted Duty Roster list' });
	}

	async goto(orgId: string) {
		await this.page.goto(`/org/${orgId}/duty-rosters`);
		await this.newTemplateButton.waitFor({ state: 'visible', timeout: 10000 });
		await this.page.waitForLoadState('networkidle');
	}

	async gotoNewTemplate(orgId: string) {
		await this.page.goto(`/org/${orgId}/duty-rosters/new`);
		await this.templateNameInput.waitFor({ state: 'visible', timeout: 10000 });
		await this.page.waitForLoadState('networkidle');
	}

	async createTemplate(orgId: string, input: DutyRosterTemplateInput) {
		await this.gotoNewTemplate(orgId);
		await this.routeSlugInput.fill(input.slug);
		await this.templateNameInput.fill(input.name);
		await this.shortCodeInput.fill(input.shortCode);

		await this.continueButton.click();
		await expect(this.page.getByRole('heading', { name: 'Pool criteria' })).toBeVisible();
		await expect(this.page.getByRole('table', { name: 'New Template resolved pool' })).toBeVisible();

		await this.continueButton.click();
		await expect(this.page.getByRole('heading', { name: 'Manual DA6 baseline' })).toBeVisible();

		await this.continueButton.click();
		await expect(this.page.getByRole('heading', { name: 'Review' })).toBeVisible();
		await expect(this.page.getByText(input.name, { exact: true })).toBeVisible();

		await this.saveTemplateButton.click();
		await expect(this.page).toHaveURL(new RegExp(`/org/${orgId}/duty-rosters/${input.slug}/generate$`));
		await expect(this.generatePreviewButton).toBeVisible({ timeout: 10000 });
	}

	async expectTemplateInRegister(name: string) {
		const register = this.page.getByRole('table', { name: 'Duty Roster Template register' });
		await expect(register).toBeVisible({
			timeout: 10000
		});
		await expect(register.getByText(name).first()).toBeVisible();
	}

	async openGenerateForTemplate(name: string) {
		await this.page.getByRole('link', { name: `Generate ${name}` }).click();
		await expect(this.generatePreviewButton).toBeVisible({ timeout: 10000 });
	}

	async setEndDateDay(dayOfMonth: number) {
		await this.page.getByRole('button', { name: 'End Date' }).click();
		const dayButton = this.page
			.locator('[data-bits-day]')
			.filter({ hasText: new RegExp(`^${dayOfMonth}$`) })
			.first();
		await dayButton.click();
	}

	async generatePreview(options: { endDayOfMonth?: number } = {}) {
		if (options.endDayOfMonth) {
			await this.setEndDateDay(options.endDayOfMonth);
		}

		await this.generatePreviewButton.click();
		await expect(this.generatedPreviewTable).toBeVisible({ timeout: 15000 });
		await expect(this.page.getByRole('heading', { name: 'Ready to accept' })).toBeVisible();
		await expect.poll(async () => this.generatedPreviewTable.getByRole('row').count()).toBeGreaterThan(1);
	}

	async acceptAndApplyRun(orgId: string, templateSlug: string) {
		await this.acceptAndApplyButton.click();
		await expect(this.page).toHaveURL(new RegExp(`/org/${orgId}/duty-rosters/${templateSlug}/history/.+`), {
			timeout: 15000
		});
		await expect(this.acceptedRunRecord).toBeVisible({ timeout: 10000 });
		await expect(this.acceptedRunRecord.getByLabel('Duty roster status: Applied').first()).toBeVisible();
		await expect(this.acceptedRunList).toBeVisible();
	}
}
