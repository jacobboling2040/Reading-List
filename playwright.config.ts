import { defineConfig } from '@playwright/test';
import { E2E_PORT } from './tests/e2e/ports';

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	workers: 1,
	use: { baseURL: `http://localhost:${E2E_PORT}` }
});
