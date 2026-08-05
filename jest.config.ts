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
      // react-i18next 16 widens React.HTMLAttributes.children,
      // tripping spurious PatternFly prop checks. remove after sdk 4.22 bump
      diagnostics: false,
    }],
  },
  moduleNameMapper: {
    // CSS and static file imports
    '\\.(css|svg|png|jpg|jpeg|gif)$': '<rootDir>/__mocks__/fileMock.ts',
    // ESM modules that Jest cannot parse — stub with no-op exports
    '^@openshift-console/dynamic-plugin-sdk$': '<rootDir>/__mocks__/esmStubs.ts',
    '^@patternfly/react-topology$': '<rootDir>/__mocks__/esmStubs.ts',
  },
  testMatch: ['**/*.test.{ts,tsx}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
};

export default config;
