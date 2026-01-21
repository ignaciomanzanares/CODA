#!/bin/bash

BASE_URL="http://localhost:5000"

# Login and get token
echo "=== 1. Login ==="
TOKEN=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"demo123"}' | jq -r '.token')
echo "Token: ${TOKEN:0:30}..."

# Test endpoints
echo -e "\n=== 2. List Bill Splits ==="
curl -s $BASE_URL/api/bill-splits -H "Authorization: Bearer $TOKEN" | jq 'length'

echo -e "\n=== 3. Create Bill Split ==="
NEW_SPLIT=$(curl -s -X POST $BASE_URL/api/bill-splits \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Team Lunch",
    "totalAmount": 150,
    "description": "Friday team lunch",
    "participants": [
      {"name": "Alice", "email": "alice@test.com"},
      {"name": "Bob"}
    ]
  }')
echo "$NEW_SPLIT" | jq '{id, name, totalAmount}'
SPLIT_ID=$(echo "$NEW_SPLIT" | jq -r '.id')

echo -e "\n=== 4. Get Bill Split Participants ==="
curl -s "$BASE_URL/api/bill-splits" -H "Authorization: Bearer $TOKEN" | jq ".[] | select(.id == $SPLIT_ID) | .participants"

echo -e "\n=== 5. Update Bill Split ==="
curl -s -X PUT "$BASE_URL/api/bill-splits/$SPLIT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Team Lunch (Updated)", "description": "Friday team lunch at Joes"}' | jq '{id, name, description}'

echo -e "\n=== 6. Mark Participant as Paid ==="
PARTICIPANT_ID=$(curl -s "$BASE_URL/api/bill-splits" -H "Authorization: Bearer $TOKEN" | jq -r ".[] | select(.id == $SPLIT_ID) | .participants[0].id")
curl -s -X POST "$BASE_URL/api/bill-splits/$SPLIT_ID/participants/$PARTICIPANT_ID/pay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 75, "method": "venmo"}' | jq '{message, participant: .participant.isPaid}'

echo -e "\n=== 7. Delete Bill Split ==="
curl -s -X DELETE "$BASE_URL/api/bill-splits/$SPLIT_ID" -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n=== All Tests Complete ==="
