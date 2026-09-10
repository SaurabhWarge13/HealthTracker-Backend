// ts-jest so the tests run against `src` directly, with a generous timeout
// because they touch the real SQLite file.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.test.ts'],
  testTimeout: 20_000,
};
