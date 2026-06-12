import js from '@eslint/js'
import globals from 'globals'
import reactDoctor from 'eslint-plugin-react-doctor'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.wrangler', 'worker-configuration.d.ts']),
  // Repo-wide TypeScript baseline
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  // React rules (create-vite template + react-doctor's rule set), website only
  {
    files: ['web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite, reactDoctor.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // 500 lines is the owner's split-this-file signal — a warning, budgeted by --max-warnings
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
])
