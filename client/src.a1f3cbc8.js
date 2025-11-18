/**
 * Lightweight chat client used by the legacy HTML entry point.
 * Renders a minimal interface inside #container and connects to the Node.js WS server.
 */
(function () {
  const container = document.getElementById("container");
  if (!container) {
    console.warn("Chat container not found");
    return;
  }

  container.innerHTML = `
    <div class="_header_4nm0s_5">
      <div class="_title_4nm0s_29">快乐划水鸭 ～ 即时聊天室</div>
    </div>
    <div class="_messagesList_4nm0s_46">
      <div class="_intro_4nm0s_33">Messages (<span id="messageCounter">0</span>)</div>
      <ul class="_messagesList_4nm0s_46" id="messages"></ul>
    </div>
    <div class="_bottomBar_4nm0s_36">
      <div class="_textFeildRow_4nm0s_61">
        <div class="_textFeildWrapper_17dbd_1">
          <input id="nickname" class="_textFeild_17dbd_1" type="text" placeholder="请输入昵称" maxlength="24"/>
        </div>
      </div>
      <div class="_textFeildRow_4nm0s_61">
        <div class="_textFeildWrapper_17dbd_1">
          <input id="message" class="_textFeild_17dbd_1" type="text" placeholder="请输入消息内容"/>
        </div>
      </div>
      <div class="_buttonCommon_b0y0d_1">
        <a id="sendButton">发送</a>
      </div>
    </div>
  `;

  const nicknameInput = document.getElementById("nickname");
  const messageInput = document.getElementById("message");
  const sendButton = document.getElementById("sendButton");
  const listEl = document.getElementById("messages");
  const counterEl = document.getElementById("messageCounter");

  const messages = [];
  let socket;
  const WS_PATH = "/ws/"; // Keep in sync with docs/nginx/cyberpi.tech.conf
  const DEFAULT_WS_PORT = 23333; // Backend port, proxied by Nginx location /ws/
  const RECONNECT_BASE_DELAY = 800;
  const RECONNECT_MAX_DELAY = 12000;
  const PORT_PLAN = Object.freeze({
    nginx: "80/443",
    websocket: DEFAULT_WS_PORT,
    futureApi: "3000-4000",
  });
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  console.info(
    "[nytoy-mini]",
    "Reverse-proxy endpoint:",
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}${WS_PATH}`,
    "-> 127.0.0.1:" + DEFAULT_WS_PORT
  );
  console.info("[nytoy-mini] Port suggestions:", PORT_PLAN);
  console.info(
    "[nytoy-mini] forever/PM2 提醒: 记得配置 --minUptime/--spinSleepTime 或 pm2 save，确保 Node 崩溃后自动恢复。"
  );

  function updateCounter() {
    counterEl.textContent = messages.length.toString();
  }

  function renderMessages() {
    listEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    messages.slice(-200).forEach((msg) => {
      const row = document.createElement("div");
      row.className = "_messageRow_4nm0s_49";
      const badge = document.createElement("span");
      badge.className = msg.self ? "_messageMe_4nm0s_53" : "_messageUser_4nm0s_57";
      badge.textContent = msg.nickname || "匿名";
      row.appendChild(badge);
      row.appendChild(document.createTextNode(`: ${msg.content}`));
      fragment.appendChild(row);
    });
    listEl.appendChild(fragment);
    listEl.scrollTop = listEl.scrollHeight;
    updateCounter();
  }

  function appendMessage(payload) {
    messages.push({
      nickname: payload.nickname || "匿名",
      content: payload.content,
      self: Boolean(payload.self),
      timestamp: payload.timestamp || Date.now(),
    });
    renderMessages();
  }

  function resolveSocketUrl() {
    const override = typeof window.NYTOY_WS_ENDPOINT === "string" ? window.NYTOY_WS_ENDPOINT.trim() : "";
    if (override) {
      return override;
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname || "127.0.0.1";
    const currentPort = window.location.port;
    const portSegment = currentPort
      ? `:${currentPort}`
      : protocol === "ws"
      ? `:${DEFAULT_WS_PORT}`
      : "";
    return `${protocol}://${host}${portSegment}${WS_PATH}`;
  }

  function scheduleReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY * reconnectAttempts, RECONNECT_MAX_DELAY);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
    console.warn(`ws reconnecting in ${Math.round(delay / 100) / 10}s…`);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    const target = resolveSocketUrl();
    try {
      socket = new WebSocket(target);
    } catch (err) {
      console.error("WebSocket init error", err);
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      console.log("ws connected", target);
    });

    socket.addEventListener("close", () => {
      console.warn("ws closed, retrying…");
      scheduleReconnect();
    });

    socket.addEventListener("error", (err) => {
      console.error("ws error", err);
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.content) {
          appendMessage({ nickname: data.nickname, content: data.content, timestamp: Date.now() });
        }
      } catch (e) {
        console.warn("Invalid WS message", event.data);
      }
    });
  }

  function sendMessage() {
    const nickname = nicknameInput.value.trim();
    const content = messageInput.value.trim();
    if (!nickname || !content) {
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      alert("WebSocket 未连接，稍等片刻再试~");
      return;
    }
    const payload = { nickname, content };
    socket.send(JSON.stringify(payload));
    appendMessage({ ...payload, self: true });
    messageInput.value = "";
    messageInput.focus();
  }

  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      sendMessage();
    }
  });

  connect();
})();
