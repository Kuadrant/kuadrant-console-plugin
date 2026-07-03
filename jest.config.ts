import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    // CSS and static file imports
    '\\.(css|svg|png|jpg|jpeg|gif)$': '<rootDir>/__mocks__/fileMock.ts',
  },
  testMatch: ['**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
};

export default config;
