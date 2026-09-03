const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist', 'node_modules'],
  },

  eslint.configs.recommended,

  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.cjs'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
