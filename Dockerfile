# KAN-6 - Sichere Hello-World Website
FROM nginx:alpine

# Nginx Config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Static Files
COPY src/ /usr/share/nginx/html/

EXPOSE 80 443
