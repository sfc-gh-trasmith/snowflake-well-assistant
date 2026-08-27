#!/bin/bash
set -e

SNOWFLAKE_CONNECTION="${SNOWFLAKE_CONNECTION:-default}"
DATABASE="${DATABASE:-ENERGY_DEMO}"
SCHEMA="${SCHEMA:-WELLS}"
REPO_NAME="${REPO_NAME:-WELL_APP_REPO}"
IMAGE_NAME="${IMAGE_NAME:-well-analytics-app}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== SPCS Build & Push Script ==="
echo "Connection: $SNOWFLAKE_CONNECTION"
echo "Repository: $DATABASE.$SCHEMA.$REPO_NAME"
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo ""

echo "[1/5] Getting registry URL..."
REPO_URL=$(snow spcs image-repository url "$DATABASE.$SCHEMA.$REPO_NAME" -c "$SNOWFLAKE_CONNECTION" 2>/dev/null || echo "")

if [ -z "$REPO_URL" ]; then
    echo "[2/5] Repository not found. Creating $DATABASE.$SCHEMA.$REPO_NAME..."
    snow sql -q "CREATE IMAGE REPOSITORY IF NOT EXISTS $DATABASE.$SCHEMA.$REPO_NAME" -c "$SNOWFLAKE_CONNECTION"
    sleep 2
    REPO_URL=$(snow spcs image-repository url "$DATABASE.$SCHEMA.$REPO_NAME" -c "$SNOWFLAKE_CONNECTION")
else
    echo "[2/5] Repository exists: $REPO_URL"
fi

FULL_IMAGE_URL="$REPO_URL/$IMAGE_NAME:$IMAGE_TAG"
echo "Full image URL: $FULL_IMAGE_URL"
echo ""

echo "[3/5] Logging into SPCS registry..."
snow spcs image-registry login -c "$SNOWFLAKE_CONNECTION"
echo ""

echo "[4/5] Building Docker image (linux/amd64)..."
if [ -z "$VITE_MAPBOX_TOKEN" ]; then
    echo "Warning: VITE_MAPBOX_TOKEN not set. Checking frontend/.env..."
    if [ -f "frontend/.env" ]; then
        export $(grep VITE_MAPBOX_TOKEN frontend/.env | xargs)
    fi
fi
docker build --platform linux/amd64 --build-arg VITE_MAPBOX_TOKEN="$VITE_MAPBOX_TOKEN" -t "$IMAGE_NAME:$IMAGE_TAG" .
echo ""

echo "[5/5] Tagging and pushing image..."
docker tag "$IMAGE_NAME:$IMAGE_TAG" "$FULL_IMAGE_URL"
docker push "$FULL_IMAGE_URL"
echo ""

echo "=== Done! ==="
echo "Image pushed to: $FULL_IMAGE_URL"
echo ""
echo "To deploy/update the service:"
echo "  snow sql -q \"ALTER SERVICE $DATABASE.$SCHEMA.WELL_ANALYTICS_SERVICE FROM SPECIFICATION ...\" -c $SNOWFLAKE_CONNECTION"
