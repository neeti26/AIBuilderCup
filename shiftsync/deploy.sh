#!/bin/bash
# ─── ShiftSync AI — GCP Deployment Script ─────────────────────────────────────
# Usage:  bash deploy.sh <PROJECT_ID> <GEMINI_API_KEY>
# Example: bash deploy.sh shiftsync-prod AIzaSy...
#
# Prerequisites:
#   gcloud CLI installed and authenticated (gcloud auth login)
#   Docker running locally
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="${1:?Usage: bash deploy.sh <PROJECT_ID> <GEMINI_API_KEY>}"
GEMINI_API_KEY="${2:?Usage: bash deploy.sh <PROJECT_ID> <GEMINI_API_KEY>}"
REGION="asia-southeast1"   # Singapore — AI Builder Cup finale location!
JWT_SECRET=$(openssl rand -hex 32)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ShiftSync AI — GCP Deployment"
echo "  Project : $PROJECT_ID"
echo "  Region  : $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Set project ──────────────────────────────────────────────────────────
gcloud config set project "$PROJECT_ID"

# ── 2. Enable APIs ──────────────────────────────────────────────────────────
echo "📦 Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

# ── 3. Firestore ────────────────────────────────────────────────────────────
echo "🗄️  Creating Firestore database..."
gcloud firestore databases create \
  --location="$REGION" \
  --type=firestore-native \
  --quiet 2>/dev/null || echo "   (already exists)"

# Grant Cloud Run SA access to Firestore
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user" \
  --quiet

# ── 4. Secrets ──────────────────────────────────────────────────────────────
echo "🔑 Storing secrets in Secret Manager..."

# Gemini API key
echo -n "$GEMINI_API_KEY" | gcloud secrets create shiftsync-gemini-key \
  --data-file=- --replication-policy=automatic --quiet 2>/dev/null || \
echo -n "$GEMINI_API_KEY" | gcloud secrets versions add shiftsync-gemini-key \
  --data-file=- --quiet

# JWT secret (auto-generated)
echo -n "$JWT_SECRET" | gcloud secrets create shiftsync-jwt-secret \
  --data-file=- --replication-policy=automatic --quiet 2>/dev/null || \
echo -n "$JWT_SECRET" | gcloud secrets versions add shiftsync-jwt-secret \
  --data-file=- --quiet

# Grant Cloud Run SA access to secrets
gcloud secrets add-iam-policy-binding shiftsync-gemini-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --quiet

gcloud secrets add-iam-policy-binding shiftsync-jwt-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --quiet

# ── 5. Build + deploy backend ───────────────────────────────────────────────
echo "🏗️  Building backend Docker image..."
cd "$(dirname "$0")/backend"
gcloud builds submit \
  --tag "gcr.io/$PROJECT_ID/shiftsync-backend:latest" \
  --project "$PROJECT_ID" \
  --quiet

echo "� Deploying backend to Cloud Run..."
gcloud run deploy shiftsync-backend \
  --image "gcr.io/$PROJECT_ID/shiftsync-backend:latest" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets "GEMINI_API_KEY=shiftsync-gemini-key:latest,SECRET_KEY=shiftsync-jwt-secret:latest" \
  --quiet

BACKEND_URL=$(gcloud run services describe shiftsync-backend \
  --region "$REGION" --format 'value(status.url)')
echo "✅ Backend live: $BACKEND_URL"

# ── 6. Build + deploy frontend ──────────────────────────────────────────────
echo "🏗️  Building frontend Docker image..."
cd "$(dirname "$0")/frontend"
gcloud builds submit \
  --tag "gcr.io/$PROJECT_ID/shiftsync-frontend:latest" \
  --project "$PROJECT_ID" \
  --quiet

echo "� Deploying frontend to Cloud Run..."
gcloud run deploy shiftsync-frontend \
  --image "gcr.io/$PROJECT_ID/shiftsync-frontend:latest" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --concurrency 200 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "BACKEND_URL=$BACKEND_URL" \
  --quiet

FRONTEND_URL=$(gcloud run services describe shiftsync-frontend \
  --region "$REGION" --format 'value(status.url)')
echo "✅ Frontend live: $FRONTEND_URL"

# ── 7. Update backend CORS with frontend URL ────────────────────────────────
echo "🔧 Updating backend CORS to allow frontend origin..."
gcloud run services update shiftsync-backend \
  --region "$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,CORS_ORIGINS=[\"$FRONTEND_URL\",\"https://localhost:3000\"]" \
  --quiet

# ── 8. Seed demo data ───────────────────────────────────────────────────────
echo "🌱 Seeding demo users..."
curl -s -X POST "$BACKEND_URL/api/v1/seed/init-users" | python3 -m json.tool || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎉 ShiftSync AI deployed to GCP!"
echo ""
echo "  🌐 App URL    : $FRONTEND_URL"
echo "  🔌 API URL    : $BACKEND_URL"
echo "  📖 API Docs   : $BACKEND_URL/docs"
echo ""
echo "  Demo login    : supervisor / demo123"
echo "  Region        : $REGION (Singapore)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
