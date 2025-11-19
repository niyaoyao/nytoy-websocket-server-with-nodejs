## nytoy-websocket-server-with-nodejs

Real-time chat stack built from a lightweight static client (`client/`) and a Node.js WebSocket backend (`app.js`). This document is now the **default English deployment guide**; a Chinese summary is included at the end.

---

## 1. Project layout

| Path | Description |
| --- | --- |
| `app.js` | Express + `ws` server. Serves `/chatroom` static assets and listens on port `23333`. |
| `client/` | Production-ready assets: `chat.js` (main UI), `src.a1f3cbc8.js` (legacy inline UI), styles, icons. Both JS bundles auto-detect reverse-proxied WSS endpoints and include reconnection/PM2 tips. |
| `docs/nginx/cyberpi.tech.conf` | Drop-in Nginx config for `cyberpi.tech`, featuring HTTPS, static routes, and `/ws/` reverse proxy. |

---

## 2. Prerequisites

1. **OS**: CentOS 7/8 or similar with sudo access.
2. **Node.js ≥ 16**: `curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - && sudo yum install -y nodejs`
3. **Nginx + Certbot**: `sudo yum install -y nginx certbot`, certificates ready for `cyberpi.tech` and `www.cyberpi.tech`.
4. **PM2 (recommended) or forever**
   - `sudo npm install -g pm2`
   - If you prefer `forever`, remember to pass `--minUptime 10000 --spinSleepTime 5000` to avoid restart storms after crashes.

---

## 3. Fetch the code & install dependencies

```bash
cd /opt
sudo git clone https://github.com/<your-account>/nytoy-websocket-server-with-nodejs.git
sudo chown -R $USER:$USER nytoy-websocket-server-with-nodejs
cd nytoy-websocket-server-with-nodejs
npm install --production
```

Alternative (upload from local machine):

```bash
tar czf nytoy-chat.tar.gz nytoy-websocket-server-with-nodejs
scp nytoy-chat.tar.gz user@SERVER_IP:/tmp/
sudo mkdir -p /opt/nytoy-websocket-server-with-nodejs
sudo tar xzf /tmp/nytoy-chat.tar.gz -C /opt/ --strip-components=1
sudo chown -R $USER:$USER /opt/nytoy-websocket-server-with-nodejs
cd /opt/nytoy-websocket-server-with-nodejs
npm install --production
```

Sync client assets to the directory exposed by Nginx:

```bash
sudo rm -rf /usr/share/nginx/html/chatroom
sudo mkdir -p /usr/share/nginx/html/chatroom
sudo cp -a client/. /usr/share/nginx/html/chatroom/
```

*(If `rsync` is available, you may use `sudo rsync -av --delete client/ /usr/share/nginx/html/chatroom/` instead.)*

---

## 4. Run the WebSocket backend

### Option A – PM2 (recommended)

```bash
cd /opt/nytoy-websocket-server-with-nodejs
pm2 start app.js --name nytoy-chat
pm2 save                 # persist process list
pm2 startup systemd      # install systemd unit that restores pm2 list
```

Useful commands: `pm2 status`, `pm2 logs nytoy-chat`, `pm2 reload nytoy-chat`, `pm2 delete nytoy-chat`.

### Option B – forever

```bash
forever start --uid "nytoy-chat" --minUptime 10000 --spinSleepTime 5000 app.js
forever list
forever restart nytoy-chat
```

`app.js` binds to port `23333` and shares the same HTTP server with Express. Nginx connects to it via `127.0.0.1:23333`.

---

## 5. Nginx (HTTPS + WSS reverse proxy)

Copy the provided config into place:

```bash
sudo cp docs/nginx/cyberpi.tech.conf /etc/nginx/conf.d/cyberpi.tech.conf
```

Contents (can be pasted directly):

```nginx
# ======================
# HTTP (80) → redirect to HTTPS
# ======================
server {
    listen 80;
    server_name cyberpi.tech www.cyberpi.tech;
    return 301 https://$host$request_uri;
}


# ======================
# HTTPS (443)
# ======================
server {
    listen 443 ssl http2;
    server_name cyberpi.tech www.cyberpi.tech;

    ssl_certificate /etc/letsencrypt/live/cyberpi.tech/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/cyberpi.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    location /quickdraw/ {
        try_files $uri $uri/ /quickdraw/index.html;
    }

    location /chatbot/ {
        try_files $uri $uri/ /chatbot/index.html;
    }

    # WebSocket reverse proxy – must stay aligned with client JS (/ws/)
    location /ws/ {
        proxy_pass http://127.0.0.1:23333;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_buffering off;
    }
}
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Front-end behavior (HTTPS + WSS compatible)

Both `client/chat.js` and `client/src.a1f3cbc8.js`:

1. Detect the current scheme. When loaded over HTTPS they automatically connect to `wss://<host>/ws/`; for local HTTP development they fall back to `ws://<host>:23333/ws/`.
2. Allow overriding via `window.NYTOY_WS_ENDPOINT = "wss://www.cyberpi.tech/ws/";` before the script tag.
3. Include reconnection backoff (800 ms base, max 12 s), clear status logs, and console reminders about PM2/forever hardening plus future port planning. This prevents infinite reconnect loops after backend crashes.

Expect to see logs similar to:

```
[nytoy] WS via reverse proxy: wss://www.cyberpi.tech/ws/ -> 127.0.0.1:23333
[nytoy] Port plan: { nginx: '80/443', websocket: 23333, futureApi: '3000-4000' }
```

---

## 7. AI bot via OpenRouter

The chatroom can now summon an AI assistant (same OpenRouter workflow used in `client/aibot/`). Configure these environment variables before starting `app.js`:

| Variable | Default | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | _(unset)_ | Required. Your OpenRouter API key. |
| `OPENROUTER_MODEL` | `deepseek/deepseek-r1:free` | Optional. Any model slug supported by OpenRouter. |
| `CHAT_AI_NICKNAME` | `摸鱼AI` | Display name for AI replies inside the chat. |
| `CHAT_AI_PROMPT` | Friendly CN prompt | System prompt used for every request. |
| `OPENROUTER_SITE_URL` | `https://nytoy-chatroom.local` | Sent as `HTTP-Referer` header per OpenRouter policy. |
| `OPENROUTER_SITE_NAME` | `nytoy-chatroom` | Sent as `X-Title`. |

Usage (front-end):

1. Type your question in the regular input field.
2. Either click **“问摸鱼AI”** or include `@bot` anywhere in the message. The backend auto-detects the flag and fetches a reply from OpenRouter.
3. Everyone in the room will receive the AI response, highlighted with a blue frame.

If the API key is missing or OpenRouter returns an error, the requester receives a private system message explaining the failure.

Restart the PM2/forever process after exporting new env vars to apply the configuration.

---

## 8. Port planning

| Component | Port(s) | Notes |
| --- | --- | --- |
| Nginx HTTP/HTTPS | 80 / 443 | Only public entry point; handles TLS + proxying. |
| WebSocket backend (`app.js`) | 23333 | Bind to `127.0.0.1` and expose via `/ws/`. |
| REST/GraphQL APIs (future) | 3000–4000 | Keep isolated from WS for rate limiting. |
| Background workers | 5000+ | Internal only; restrict via firewall/security groups. |

Document this table for future infrastructure work to avoid conflicts.

---

## 9. WebSocket reliability checklist

1. **Reverse proxy timeouts**: `proxy_read_timeout`/`proxy_send_timeout` set to 3600 s to prevent idle disconnects.
2. **Server heartbeat**: `app.js` pings every 30 s and terminates dead clients.
3. **Process supervision**: PM2 `pm2 save`/`pm2 startup` or forever `--minUptime`/`--spinSleepTime`.
4. **Logging/monitoring**: `pm2 monit`, ship logs to ELK/CloudWatch if desired.
5. **Graceful deploys**: `pm2 reload nytoy-chat` keeps connections alive during restarts.
6. **Client resilience**: front-end retry loop announces the next reconnect delay and recovers automatically once the backend returns.

---

## 9. Verification steps

1. `pm2 status` (or `forever list`) shows `nytoy-chat` as `online`.
2. `curl -I https://www.cyberpi.tech/chatroom/` returns `200`.
3. Browser DevTools → Network shows `wss://www.cyberpi.tech/ws/` connected with code `101`.
4. Messages sent between two browsers arrive instantly and display correct timestamps.

---

## 10. Maintenance tips

- Pull new code and redeploy static assets: `git pull --ff-only && pm2 restart nytoy-chat`.
- Auto-renew certificates: `sudo certbot renew` via cron/systemd timer.
- Backup `/etc/nginx/conf.d/cyberpi.tech.conf` and `/opt/nytoy-websocket-server-with-nodejs`.
- Flush PM2 logs periodically: `pm2 flush` or configure logrotate.

---

## 11. 中文摘要（Chinese summary）

- 项目包含：`client/` 前端静态文件、`app.js` Node WebSocket 服务、`docs/nginx/cyberpi.tech.conf` Nginx 配置。
- 环境需求：Node.js ≥16、Nginx+Certbot、PM2（或 forever，务必加 `--minUptime/--spinSleepTime`）。
- 部署步骤：上传代码 → `npm install --production` → 将 `client/` 复制到 `/usr/share/nginx/html/chatroom/` → 使用 PM2 启动 `app.js`（监听 23333）→ 按文档配置 `/ws/` 反向代理并重载 Nginx。
- 前端自动适配 HTTPS/WSS，支持注入 `window.NYTOY_WS_ENDPOINT`，并带有重连、端口规划提示。
- WebSocket 稳定性：Nginx 长连接超时、后端 ping/pong、PM2/forever 守护、前端退避重连。
- 验证：`pm2 status`、`curl -I https://www.cyberpi.tech/chatroom/`、浏览器确认 `wss://…/ws/` 连接成功、多人互发消息。

Happy chatting! 😄
