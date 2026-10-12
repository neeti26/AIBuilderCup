#!/bin/bash
# ─── ShiftSync AI — GCP Deployment Script ─────────────────────────────────────
# Run this from the /shiftsync directory
# Prerequisites: gcloud CLI authenticated, PROJECT_ID set

set -e

PROJECT_ID=${1:-"shiftsync-manufacturing"}
REGION="asia-southeast1"   # Singapore — closest to the finale location!

echo "🚀 Deploying ShiftSync AI to GCP project: $PROJECT_ID (region: $REGION)"

# Set project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📦 Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com

# Create Firestore database (if it doesn't exist)
echo "🗄️  Setting up Firestore..."
gcloud firestore databases create --region=$REGION --type=firestore-native 2>/dev/null || echo "Firestore already exists"

# Store Gemini API key in Secret Manager
echo "🔑 Setting up secrets..."
echo "Enter your Gemini API key:"
read -s GEMINI_KEY
echo $GEMINI_KEY | gcloud secrets create shiftsync-gemini-key \
  --data-file=- \
  --replication-policy=automatic 2>/dev/null || \
  echo $GEMINI_KEY | gcloud secrets versions add shiftsync-gemini-key --data-file=-

# Build & deploy backend
echo "🏗️  Building backend..."
cd backend
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/shiftsync-backend \
  --project $PROJECT_ID

echo "🚢 Deploying backend to Cloud Run..."
gcloud run deploy shiftsync-backend \
  --image gcr.io/$PROJECT_ID/shiftsync-backend \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
  --set-secrets GEMINI_API_KEY=shiftsync-gemini-key:latest

BACKEND_URL=$(gcloud run services describe shiftsync-backend \
  --region $REGION --format 'value(status.url)')
echo "✅ Backend deployed: $BACKEND_URL"

# Build & deploy frontend
echo "🏗️  Building frontend..."
cd ../frontend
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/shiftsync-frontend \
  --project $PROJECT_ID \
  --substitutions=_BACKEND_URL=$BACKEND_URL

echo "🚢 Deploying frontend to Cloud Run..."
gcloud run deploy shiftsync-frontend \
  --image gcr.io/$PROJECT_ID/shiftsync-frontend \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --concurrency 200 \
  --min-instances 0 \
  --max-instances 5

FRONTEND_URL=$(gcloud run services describe shiftsync-frontend \
  --region $REGION --format 'value(status.url)')
echo "✅ Frontend deployed: $FRONTEND_URL"

echo ""
echo "🎉 ShiftSync AI deployed successfully!"
echo "   Frontend: $FRONTEND_URL"
echo "   Backend:  $BACKEND_URL"
echo "   API Docs: $BACKEND_URL/docs"
echo ""
echo "📝 Next: Initialize demo users by calling:"
echo "   curl -X POST $BACKEND_URL/api/v1/seed/init-users"
