#!/bin/bash

echo "🔧 Fixing Docker credential issues..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Backup existing config
if [ -f ~/.docker/config.json ]; then
    echo "📁 Backing up existing Docker config..."
    cp ~/.docker/config.json ~/.docker/config.json.backup
fi

# Method 1: Remove credsStore from config
if [ -f ~/.docker/config.json ]; then
    echo "🔧 Removing credsStore from Docker config..."
    # Create a temporary file without the credsStore line
    grep -v '"credsStore"' ~/.docker/config.json > ~/.docker/config_temp.json
    mv ~/.docker/config_temp.json ~/.docker/config.json
fi

# Method 2: Try docker logout and login
echo "🔐 Attempting to reset Docker credentials..."
docker logout 2>/dev/null || true

# Test if Docker works now
echo "🧪 Testing Docker functionality..."
if docker run --rm hello-world > /dev/null 2>&1; then
    echo "✅ Docker is working properly!"
    echo ""
    echo "You can now build and run your AI market backend:"
    echo "  docker build -t ai-market-backend ."
    echo "  docker run --env-file .env ai-market-backend"
else
    echo "⚠️  Docker still has issues. Alternative solutions:"
    echo ""
    echo "Option 1 - Complete reset (will require re-login to registries):"
    echo "  rm ~/.docker/config.json"
    echo "  docker login"
    echo ""
    echo "Option 2 - Run without Docker:"
    echo "  pip install -r requirements.txt"
    echo "  python ai_market_backend.py"
    echo ""
    echo "Option 3 - Use alternative Docker config:"
    echo "  echo '{}' > ~/.docker/config.json"
fi

echo ""
echo "For more help, check the README troubleshooting section."