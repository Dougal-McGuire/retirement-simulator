#!/bin/bash

# Kill any process using port 3000
echo "🔄 Stopping any process on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "✅ Port 3000 is free"

# Start the development server with pnpm
echo "🚀 Starting development server on port 3000 (pnpm)..."
pnpm run dev
