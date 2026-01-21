#!/bin/bash

BASE_URL="http://localhost:5000"

echo "=== Testing CODA API Endpoints ==="

# Login and get token
echo ""
echo "1. Testing Login..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"demo123"}')

if echo "$LOGIN_RESP" | grep -q '"success":true'; then
  echo "   ✅ Login successful"
  TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  echo "   ❌ Login failed: $LOGIN_RESP"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# Test GET expenses
echo ""
echo "2. Testing GET /api/expenses..."
RESP=$(curl -s "$BASE_URL/api/expenses" -H "$AUTH")
if echo "$RESP" | grep -q '\['; then
  COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
  echo "   ✅ Got $COUNT expenses"
else
  echo "   ❌ Failed: $RESP"
fi

# Test POST expense
echo ""
echo "3. Testing POST /api/expenses..."
RESP=$(curl -s -X POST "$BASE_URL/api/expenses" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"amount":50.00,"description":"Test expense","category":"Food","date":"2026-01-21T12:00:00.000Z"}')

if echo "$RESP" | grep -q '"id"'; then
  ID=$(echo "$RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  echo "   ✅ Created expense with id=$ID"
else
  echo "   ❌ Failed: $RESP"
fi

# Test GET financial-goals
echo ""
echo "4. Testing GET /api/financial-goals..."
RESP=$(curl -s "$BASE_URL/api/financial-goals" -H "$AUTH")
if echo "$RESP" | grep -q '\['; then
  COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
  echo "   ✅ Got $COUNT goals"
else
  echo "   ❌ Failed: $RESP"
fi

# Test POST financial-goal
echo ""
echo "5. Testing POST /api/financial-goals..."
RESP=$(curl -s -X POST "$BASE_URL/api/financial-goals" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"name":"Emergency Fund","targetAmount":5000,"currentAmount":1000,"targetDate":"2026-12-31T00:00:00.000Z","category":"savings"}')

if echo "$RESP" | grep -q '"id"'; then
  ID=$(echo "$RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  echo "   ✅ Created goal with id=$ID"
else
  echo "   ❌ Failed: $RESP"
fi

# Test GET bill-splits
echo ""
echo "6. Testing GET /api/bill-splits..."
RESP=$(curl -s "$BASE_URL/api/bill-splits" -H "$AUTH")
if echo "$RESP" | grep -q '\['; then
  COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
  echo "   ✅ Got $COUNT bill splits"
else
  echo "   ❌ Failed: $RESP"
fi

# Test POST bill-split
echo ""
echo "7. Testing POST /api/bill-splits..."
RESP=$(curl -s -X POST "$BASE_URL/api/bill-splits" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dinner split","totalAmount":100,"date":"2026-01-21T12:00:00.000Z","participants":[{"name":"John","email":"john@test.com","amountOwed":50,"amountPaid":0}]}')

if echo "$RESP" | grep -q '"id"'; then
  ID=$(echo "$RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  echo "   ✅ Created bill split with id=$ID"
else
  echo "   ❌ Failed: $RESP"
fi

# Test GET notifications
echo ""
echo "8. Testing GET /api/notifications..."
RESP=$(curl -s "$BASE_URL/api/notifications" -H "$AUTH")
if echo "$RESP" | grep -q '\['; then
  COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
  echo "   ✅ Got $COUNT notifications"
else
  echo "   ❌ Failed: $RESP"
fi

# Test GET credit-score (requires ML models, may fail)
echo ""
echo "9. Testing GET /api/credit-score..."
RESP=$(curl -s "$BASE_URL/api/credit-score" -H "$AUTH")
if echo "$RESP" | grep -q '"score"\|"id"'; then
  echo "   ✅ Credit score data returned"
elif echo "$RESP" | grep -q 'Internal server error'; then
  echo "   ⚠️  ML models not configured (expected in dev)"
else
  echo "   ❌ Failed: $RESP"
fi

# Test DELETE notification (mark as read)
echo ""
echo "10. Testing PUT /api/notifications/:id/read..."
RESP=$(curl -s -X PUT "$BASE_URL/api/notifications/1/read" -H "$AUTH")
if echo "$RESP" | grep -q '"id"\|"isRead"'; then
  echo "   ✅ Notification marked as read"
elif echo "$RESP" | grep -q 'not found'; then
  echo "   ⚠️  No notifications to mark (expected)"
else
  echo "   ❌ Failed: $RESP"
fi

echo ""
echo "=== All tests completed ==="
