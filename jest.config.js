module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test files
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Coverage
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    'public/js/**/*.js',
    '!server/index.js', // Exclude main entry point
    '!**/node_modules/**',
    '!coverage/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  
  // Setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/server/$1',
    '^@public/(.*)$': '<rootDir>/public/$1'
  },
  
  // Timeout for tests
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true
};