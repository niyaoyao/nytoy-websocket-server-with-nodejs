## nytoy-websocket-server-with-nodejs

单页前端（`client/`）+ Node.js WebSocket 服务（`app.js`）的在线聊天室。该文档描述如何将代码同步到 `/usr/share/nginx/html`，并通过 Nginx HTTPS + 反代 WebSocket (`/ws/`) 暴露到公网，同时使用 PM2 / forever 保证进程掉线后自动恢复。

---

## 1. 目录速览

| 路径 | 说明 |
| --- | --- |
| `app.js` | Express + `ws` 后端，监听 `23333` 端口并挂载 `/chatroom` 静态资源。 |
| `client/` | 构建好的前端：`chat.js`（主界面）、`src.a1f3cbc8.js`（轻量入口）、`chat.css` 等。两份 JS 都会自动解析 `wss://<domain>/ws/`，并内置断线重连、端口规划及 PM2/forever 提示。 |
| `docs/nginx/cyberpi.tech.conf` | 可直接复制到 `/etc/nginx/conf.d/` 的 Nginx 配置，含 HTTPS、静态站点和 `/ws/` 反向代理。 |

---

## 2. 先决条件

1. **系统**：CentOS 7/8 或兼容发行版，具备 sudo 权限。
2. **Node.js ≥ 16**：`curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - && sudo yum install -y nodejs`
3. **Nginx + Certbot**：`sudo yum install -y nginx certbot`，提前签发 `cyberpi.tech`/`www.cyberpi.tech` 证书。
4. **PM2**（推荐）或 **forever**：
   - `sudo npm install -g pm2`
   - 如果喜欢 `forever`，确保命令中带 `--minUptime 10000 --spinSleepTime 5000`，避免崩溃后频繁重启。

---

## 3. 获取代码与安装依赖

```bash
cd /opt
sudo git clone https://github.com/<your-account>/nytoy-websocket-server-with-nodejs.git
sudo chown -R $USER:$USER nytoy-websocket-server-with-nodejs
cd nytoy-websocket-server-with-nodejs
npm install --production
```

或将本地打包上传：

```bash
tar czf nytoy-chat.tar.gz nytoy-websocket-server-with-nodejs
scp nytoy-chat.tar.gz user@SERVER_IP:/tmp/
sudo mkdir -p /opt/nytoy-websocket-server-with-nodejs
sudo tar xzf /tmp/nytoy-chat.tar.gz -C /opt/nytoy-websocket-server-with-nodejs --strip-components=1
sudo chown -R $USER:$USER /opt/nytoy-websocket-server-with-nodejs
cd /opt/nytoy-websocket-server-with-nodejs
npm install --production
```

同步静态资源到 Nginx 根目录：

```bash
sudo mkdir -p /usr/share/nginx/html/chatroom
sudo rsync -av --delete client/ /usr/share/nginx/html/chatroom/
```

---

## 4. 启动 WebSocket 后端

### 使用 PM2（推荐）

```bash
cd /opt/nytoy-websocket-server-with-nodejs
pm2 start app.js --name chatroom
pm2 save                 # 持久化进程列表
pm2 startup systemd      # 生成 systemd unit
```

PM2 命令：`pm2 status`、`pm2 logs nytoy-chat`、`pm2 reload nytoy-chat`、`pm2 delete nytoy-chat`。

### 使用 forever（备选）

```bash
forever start --uid "nytoy-chat" --minUptime 10000 --spinSleepTime 5000 app.js
forever list
forever restart nytoy-chat
```

`app.js` 默认监听 `23333`，并在日志中输出 `Server started on port 23333`。Nginx 将通过内网 `127.0.0.1:23333` 访问该端口。

---

## 5. Nginx + HTTPS + WSS

复制 `docs/nginx/cyberpi.tech.conf` 到服务器：

```bash
sudo cp docs/nginx/cyberpi.tech.conf /etc/nginx/conf.d/cyberpi.tech.conf
```

配置内容（可直接覆盖）：

```nginx
# ======================
# HTTP (80) → 自动跳转 HTTPS
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

    # WebSocket 反向代理（与 client JS 中的 /ws/ 保持一致）
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

检测并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. 前端（HTTPS + WSS 兼容）

`client/chat.js` 与 `client/src.a1f3cbc8.js` 会：

1. **自动识别协议**：访问 HTTPS 时默认使用 `wss://<domain>/ws/`；HTTP 开发环境则使用 `ws://<host>:23333/ws/`。
2. **自定义入口**：可在 `index.html` 中注入 `window.NYTOY_WS_ENDPOINT = "wss://www.cyberpi.tech/ws/";` 覆盖默认地址。
3. **稳定性优化**：指数退避重连（800ms 起，最多 12s），错误状态提示，并打印端口规划提示，提醒在 PM2/forever 中开启 `pm2 save` 或 `--minUptime/--spinSleepTime`。

部署静态文件后，浏览器控制台应看到：

```
[nytoy] WS via reverse proxy: wss://www.cyberpi.tech/ws/
```

---

## 7. 端口规划建议

| 组件 | 端口 | 说明 |
| --- | --- | --- |
| Nginx HTTP/HTTPS | 80 / 443 | 唯一对外入口，承担 TLS 与反代。 |
| WebSocket 服务 (`app.js`) | 23333 | 仅监听 `127.0.0.1`，由 `/ws/` 转发。 |
| REST / GraphQL API（可选） | 3000-4000 | 保持与 WS 分离，方便限流。 |
| 后台任务/Workers | 5000+ | 仅内部访问，结合防火墙限制。 |

将端口表写入运维文档，避免未来服务冲突。

---

## 8. WebSocket 稳定性清单

1. **反向代理**：Nginx `proxy_read_timeout` / `proxy_send_timeout` 设置为 3600 秒，解决空闲断连。
2. **心跳机制**：`app.js` 里的 `ping/pong` 会定期清理僵尸连接。
3. **进程守护**：PM2 `pm2 save && pm2 startup` 或 forever 的 `--minUptime --spinSleepTime`，确保崩溃后自动重启。
4. **日志监控**：`pm2 logs nytoy-chat`、`pm2 monit`，必要时转发到 ELK/CloudWatch。
5. **平滑发布**：使用 `pm2 reload nytoy-chat`，不中断现有连接。
6. **前端重连**：客户端会显示重连倒计时，可在网络波动时自动恢复。

---

## 9. 验证流程

1. `pm2 status`（或 `forever list`）显示 `nytoy-chat` ONLINE。
2. `curl -I https://www.cyberpi.tech/chatroom/` 返回 `200`。
3. 浏览器打开 `https://www.cyberpi.tech/chatroom/`，开发者工具 Network 面板看到 `wss://www.cyberpi.tech/ws/` 已连接。
4. 双浏览器互相发送消息，内容实时广播且时间戳正确。

---

## 10. 维护建议

- 定期 `git pull` 并执行 `pm2 restart nytoy-chat`。
- `sudo certbot renew` 加入 cron，确保证书不过期。
- 备份 `/etc/nginx/conf.d/cyberpi.tech.conf` 与 `/opt/nytoy-websocket-server-with-nodejs`。
- `pm2 flush` 或 logrotate 防止日志占满磁盘。

Happy chatting!
