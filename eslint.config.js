import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        Worker: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        // Node globals for tests
        process: 'readonly',
        global: 'readonly',
        // Browser crypto API
        crypto: 'readonly',
        // Browser animation
        cancelAnimationFrame: 'readonly',
        // Browser utilities
        structuredClone: 'readonly',
        getComputedStyle: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        // Drag and Drop API
        DragEvent: 'readonly',
        DataTransfer: 'readonly',
      },
    },
    rules: {
      // Errors that catch bugs
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-empty': 'warn',

      // Code quality
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',

      // Allow some patterns common in game code
      'no-fallthrough': 'off', // switch fallthrough can be intentional
      'no-case-declarations': 'off', // switch case scoped variables are common
    },
  },
  {
    // Web Worker files
    files: ['**/AIWorker.js', '**/*Worker.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        postMessage: 'readonly',
        onmessage: 'writable',
        importScripts: 'readonly',
      },
    },
  },
  {
    // Node.js/CommonJS files
    files: ['**/search/index.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // Test file overrides
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        test: 'readonly',
      },
    },
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.min.js',
    ],
  },
];
