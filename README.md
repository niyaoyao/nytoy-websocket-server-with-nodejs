## nytoy-websocket-server-with-nodejs

Real-time chat server built with Node.js/Express + `ws`, paired with a static HTML client inside `client/`. This guide describes how to deploy it on CentOS with **Nginx reverse-proxy + HTTPS/WSS** and manage the Node service via **PM2**.

---

## 1. Prerequisites

- CentOS 7/8 host with root (or sudo) access.
- Node.js ≥ 16.x (`curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - && sudo yum install -y nodejs`).
- Nginx installed (`sudo yum install -y nginx`) and running.
- Certbot certificates ready for `cyberpi.tech` / `www.cyberpi.tech` (Let’s Encrypt).
- PM2 (`sudo npm install -g pm2`).

Optional utilities:

```bash
sudo yum install -y git tar
```

---

## 2. Deploy the code

### 2.1. Fetch via Git

```bash
cd /opt
sudo git clone https://github.com/<your-account>/nytoy-websocket-server-with-nodejs.git
sudo chown -R $USER:$USER nytoy-websocket-server-with-nodejs
cd nytoy-websocket-server-with-nodejs
npm install --production
```

### 2.2. Or upload a tarball with `scp`

```bash
# local machine
tar czf nytoy-chat.tar.gz nytoy-websocket-server-with-nodejs
scp nytoy-chat.tar.gz user@SERVER_IP:/tmp/

# server
sudo mkdir -p /opt/nytoy-websocket-server-with-nodejs
sudo tar xzf /tmp/nytoy-chat.tar.gz -C /opt/ --strip-components=1
sudo chown -R $USER:$USER /opt/nytoy-websocket-server-with-nodejs
cd /opt/nytoy-websocket-server-with-nodejs
npm install --production
```

Sync the static assets to the directory served by Nginx:

```bash
sudo mkdir -p /usr/share/nginx/html/chatroom
sudo rsync -av --delete client/ /usr/share/nginx/html/chatroom/
```

---

## 3. Run the WebSocket backend with PM2

```bash
cd /opt/nytoy-websocket-server-with-nodejs
pm2 start app.js --name nytoy-chat
pm2 save           # persist process list
pm2 startup systemd
```

Useful commands:

```bash
pm2 status
pm2 logs nytoy-chat
pm2 restart nytoy-chat
pm2 delete nytoy-chat
```

This ensures the server auto-restarts on crash and on reboot (`pm2 startup` installs a systemd unit that reloads the saved process list).

---

## 4. Nginx configuration (HTTPS + WSS reverse proxy)

Create `/etc/nginx/conf.d/cyberpi.tech.conf` with the following contents:

```nginx
server {
    if ($host = www.cyberpi.tech) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name cyberpi.tech www.cyberpi.tech;

    # 自动重定向 HTTP 到 HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cyberpi.tech www.cyberpi.tech;

    ssl_certificate /etc/letsencrypt/live/cyberpi.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cyberpi.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ========== 静态文件 ==========
    root /usr/share/nginx/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    location /quickdraw/ {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /quickdraw/index.html;
    }

    location /chatbot/ {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /chatbot/index.html;
    }

    # ========== WebSocket 反向代理 ==========
    location /ws/ {
        proxy_pass http://127.0.0.1:23333;  # Node.js WebSocket 服务

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Then reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Front-end WSS endpoint

When serving via HTTPS, browsers must use `wss://` URLs. The provided front-end auto-detects protocol/host, but for reverse-proxy mode you can set:

```html
<script>
  window.NYTOY_WS_ENDPOINT = "wss://www.cyberpi.tech/ws/";
</script>
```

Drop this before `chat.js` (or bundle) so clients connect through Nginx, not directly to port `23333`.

---

## 5. Port planning recommendations

| Service                  | Suggested Port | Notes                                   |
|--------------------------|----------------|-----------------------------------------|
| Nginx HTTP/HTTPS         | 80 / 443       | Public entry point                      |
| WebSocket backend        | 23333          | Internal-only (proxied via `/ws/`)      |
| Future REST API          | 3000/4000      | Keep separate from WS for clarity       |
| Background workers       | 5000+          | Use firewall rules to limit exposure    |

Guidelines:

- Keep internal services bound to `127.0.0.1` unless they must be public.
- Use Nginx (or Traefik) as the only internet-facing layer; map each app to a distinct URI prefix.
- Document port usage in infrastructure notes to avoid conflicts when more services are added.

---

## 6. WebSocket stability checklist

1. **Process management**: PM2 (as configured) restarts crashed processes automatically.
2. **Health monitoring**: Use `pm2 monit` or integrate with a metrics agent (Node exporter, etc.).
3. **Timeouts**: The Nginx config extends `proxy_read_timeout` and `proxy_send_timeout` to avoid idle disconnects.
4. **Keep-alive (optional)**: Emit ping/pong frames from the server every 30–60 seconds if clients sit idle for hours.
5. **Backpressure handling**: The server broadcasts immediately; if expecting heavy traffic, queue messages or apply rate limiting at the app layer.
6. **Logging**: Redirect PM2 logs to files or services like CloudWatch/ELK for debugging connection drops.
7. **Graceful deploys**: Use `pm2 reload nytoy-chat` for zero-downtime restarts.

---

## 7. Verification steps

1. `pm2 status` shows `nytoy-chat` online.
2. `curl -I https://www.cyberpi.tech/chatroom/` returns `200`.
3. Browser opens `https://www.cyberpi.tech/chatroom/`, DevTools console shows `wss://www.cyberpi.tech/ws/` connected.
4. Messages typed in different browsers appear instantly.

---

## 8. Maintenance tips

- Pull updates: `git pull --ff-only` and `pm2 restart nytoy-chat`.
- Renew certificates: `sudo certbot renew` (with `--nginx` or cron).
- Backup configs: `/etc/nginx/conf.d/cyberpi.tech.conf`, `/opt/nytoy-websocket-server-with-nodejs`.
- Periodically rotate PM2 logs: `pm2 flush`.

Happy chatting!
