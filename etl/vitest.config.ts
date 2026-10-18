import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@etl': fileURLToPath(new URL('./src', import.meta.url))
		}
	},
	test: {
		environment: 'node'
	}
})
