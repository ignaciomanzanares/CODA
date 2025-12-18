# Testing Guide

This document describes the testing strategy and setup for FinHealth.

## Test Stack

- **Vitest**: Fast, modern testing framework
- **@vitest/ui**: Visual UI for test results
- **Coverage**: Built-in v8 coverage reporter

## Running Tests

```bash
# Run tests in watch mode (development)
npm test

# Run tests once (CI/CD)
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage report
npm run test:coverage
```

## Test Structure

```
tests/
├── setup.ts              # Test environment setup
├── features.test.ts      # Feature engineering tests
├── pdScoring.test.ts     # PD scoring model tests
└── [future tests]
```

## Writing Tests

### Example: Testing a feature

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../server/myModule";

describe("MyModule", () => {
  it("should do something", () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
```

### Test Environment

Tests run with:
- `NODE_ENV=test`
- `USE_MEM_STORAGE=1` (in-memory database)
- Mock Auth0 credentials

## Coverage Requirements

Aim for:
- **Overall**: >80%
- **Critical paths** (features, scoring): >90%
- **Routes**: >70%

## CI/CD Integration

Tests run automatically on:
- Every push to main
- Every pull request
- Pre-deployment

## Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **Keep tests isolated and independent**
4. **Mock external dependencies**
5. **Test edge cases and error conditions**

## Future Test Coverage

- [ ] API endpoint tests
- [ ] Auth0 integration tests
- [ ] Email service tests
- [ ] Model registry tests
- [ ] Frontend component tests
