// @ts-check
import eslint from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: ['node_modules', 'dist', 'coverage']
	},

	eslint.configs.recommended,
	...tseslint.configs.recommended,

	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.node
			}
		}
	},

	// Disables rules that conflict with Prettier
	prettierConfig
)
