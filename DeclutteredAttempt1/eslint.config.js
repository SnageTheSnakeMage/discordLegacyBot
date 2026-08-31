/**
 * Two jobs, in order of importance:
 *
 * 1. Hold the Discord boundary: *.logic.js files must never import
 *    discord.js or the adapter. This rule is an error from day one -
 *    the whole testing strategy rests on it.
 * 2. Catch this codebase's actual historical failure modes - leaked
 *    globals (no-undef) and unused vars. These start as warnings on the
 *    legacy files so the backlog is visible without blocking, and are
 *    errors on the new logic/test files, which start clean.
 */
const globals = require('globals');

const legacyLaxRules = {
  'no-undef': 'warn',
  'no-unused-vars': 'warn',
};

module.exports = [
  {
    ignores: ['node_modules/**', 'tests/coverage/**', 'commands/decommissioned/**', 'database/database.db'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        topLogger: 'readonly',
        CommandExecutionLogger: 'readonly',
        tileCache: 'writable',
      },
    },
    rules: legacyLaxRules,
  },
  {
    // the boundary: logic files are Discord-free, enforced not hoped
    files: ['commands/**/*.logic.js'],
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', {
        paths: [{ name: 'discord.js', message: 'Logic files must not import discord.js - keep Discord in the adapter.' }],
      }],
      'no-restricted-modules': ['error', {
        paths: [
          { name: 'discord.js', message: 'Logic files must not require discord.js - keep Discord in the adapter.' },
        ],
        patterns: ['**/_adapter*'],
      }],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest, topLogger: 'readonly', CommandExecutionLogger: 'readonly', tileCache: 'writable' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
