# nytoy-websocket-server-with-nodejs

A simple WebSocket chat server written with Node.js + `ws`. The repository contains two parts:

- `app.js` – Express + WebSocket server that listens on port `23333`.
- `client/` – pre-built static assets for the chat UI.

The sections below cover both local usage and a full CentOS + Nginx deployment.

## Local Installation & Run

```bash
npm install
node app.js
```

Visit `http://localhost:23333/chatroom` to open the UI (the page connects to the same host on port `23333` via WebSocket).

## Deploying to CentOS with Nginx

The following walkthrough assumes you are using a CentOS 7/8 host with root privileges, SELinux enabled, and HTTPS certificates managed by Certbot.

### 1. Prepare the host

```bash
sudo yum update -y
sudo yum install -y epel-release git nginx
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

Optionally install a process manager:

```bash
sudo npm install -g pm2
```

or plan to use `systemd` as shown later.

### 2. Fetch the project

```bash
cd /opt
sudo git clone https://github.com/<your-account>/nytoy-websocket-server-with-nodejs.git
sudo chown -R $USER:$USER nytoy-websocket-server-with-nodejs
cd nytoy-websocket-server-with-nodejs
npm install --production
```

### 3. Keep the server alive (systemd example)

```bash
cat <<'EOF' | sudo tee /etc/systemd/system/nytoy-chat.service
[Unit]
Description=NYToy WebSocket Chat
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nytoy-websocket-server-with-nodejs
ExecStart=/usr/bin/node /opt/nytoy-websocket-server-with-nodejs/app.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nytoy-chat
sudo systemctl status nytoy-chat --no-pager
```

If you prefer PM2:

```bash
pm2 start app.js --name nytoy-chat
pm2 save
pm2 startup systemd
```

### 4. Open the firewall

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=23333/tcp
sudo firewall-cmd --reload
```

### 5. Place the front-end files

The UI is already pre-built under `client/`. Copy (or rsync) it to the directory served by Nginx:

```bash
sudo mkdir -p /usr/share/nginx/html/chatroom
sudo rsync -av --delete client/ /usr/share/nginx/html/chatroom/
```

Re-run the `rsync` command whenever you customize the UI.

### 6. Configure Nginx

An example configuration matching `cyberpi.tech` is available at [`docs/nginx/cyberpi.tech.conf`](docs/nginx/cyberpi.tech.conf). Copy it (or merge it) into `/etc/nginx/conf.d/`:

```bash
sudo mkdir -p /etc/nginx/conf.d
sudo cp docs/nginx/cyberpi.tech.conf /etc/nginx/conf.d/cyberpi.tech.conf
```

Key items in the config:

- HTTP requests are redirected to HTTPS.
- HTTPS vhost terminates TLS using the Certbot-provisioned certificates.
- Static files under `/usr/share/nginx/html/chatroom/` are exposed at `https://www.cyberpi.tech/chatroom/`.
- Web requests under `/chatroom/` fall back to `index.html` so the SPA router works.

After editing Nginx files, validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Validate

1. Browse to `https://www.cyberpi.tech/chatroom/` and ensure the UI loads via HTTPS.
2. Confirm the WebSocket connection succeeds (the browser console should show a connected socket to `ws://<host>:23333` or `wss://` if you update the client).
3. Inspect the systemd unit logs if the WebSocket server is unreachable:

```bash
sudo journalctl -u nytoy-chat -f
```

### 8. Maintenance tips

- Pull updates: `git pull --ff-only` followed by `sudo systemctl restart nytoy-chat`.
- Renew certificates with Certbot (already configured in the sample Nginx file).
- Rotate logs or set up PM2/systemd log forwarding as needed.
