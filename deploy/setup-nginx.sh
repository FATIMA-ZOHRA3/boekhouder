#!/bin/bash
# ============================================
# Configure Nginx for Boekhouder
# Usage: bash deploy/setup-nginx.sh YOUR_DOMAIN
# Example: bash deploy/setup-nginx.sh boekhouder.nl
# For IP only: bash deploy/setup-nginx.sh _
# ============================================

DOMAIN=${1:-_}

cat > /etc/nginx/sites-available/boekhouder << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/boekhouder /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx

echo "=== Nginx configured for: ${DOMAIN} ==="

if [ "${DOMAIN}" != "_" ]; then
    echo ""
    echo "To add SSL (HTTPS), run:"
    echo "  certbot --nginx -d ${DOMAIN}"
fi
