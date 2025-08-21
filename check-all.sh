#!/bin/bash

# FinHealth Project - Complete Code Quality Check
echo "🔍 Running complete code quality check..."
echo

# Check TypeScript compilation
echo "📋 Step 1: Checking TypeScript compilation..."
if npm run check; then
    echo "✅ TypeScript check passed!"
else
    echo "❌ TypeScript check failed!"
    exit 1
fi

echo

# Check ESLint
echo "📋 Step 2: Running ESLint..."
if npx eslint . --ext .js,.jsx,.ts,.tsx; then
    echo "✅ ESLint check passed!"
else
    echo "❌ ESLint check failed!"
    exit 1
fi

echo
echo "🎉 All checks passed! Your code is clean and ready for production."
echo
echo "Remember to run this script after making changes:"
echo "  ./check-all.sh"
echo
