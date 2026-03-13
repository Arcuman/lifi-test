#!/usr/bin/env sh
set -eu

MONGO_CONTAINER="${MONGO_CONTAINER:-lifi-mongo-1}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/lifi?replicaSet=rs0}"
LIMIT="${LIMIT:-10}"

docker exec "$MONGO_CONTAINER" \
  mongosh --quiet "$MONGO_URI" \
  --eval "db.fee_events.aggregate([{ \$group: { _id: '\$integrator', count: { \$sum: 1 } } }, { \$sort: { count: -1 } }, { \$limit: $LIMIT }]).toArray()"
