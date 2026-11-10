/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/?(*.)+(spec|test).{ts,tsx}'],
  // Throwaway probe tests written during reviews (gitignored).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/__scratch_[^/]*/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/__tests__/**'],
  // Enforced by `pnpm test:coverage` (CI). The floors sit a few points below
  // the measured numbers (simulation 96/86, stores 90/83 lines/branches) so
  // they catch a real drop, not noise.
  coverageThreshold: {
    './src/lib/simulation/': { lines: 92, branches: 82 },
    './src/lib/stores/': { lines: 86, branches: 79 },
  },
}

module.exports = config
