#=========================================================================#
# Mahjong Nusantara — template nginx HestiaCP (HTTP)                      #
# Meneruskan domain ke server Node di 127.0.0.1:__PORT__ (termasuk WebSocket) #
#=========================================================================#

server {
    listen      %ip%:__LISTEN_PORT__;
    server_name %domain_idn% %alias_idn%;

    access_log  /var/log/nginx/domains/%domain%.log combined;
    error_log   /var/log/nginx/domains/%domain%.error.log error;

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

    location ~ /\.(?!well-known\/) {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
