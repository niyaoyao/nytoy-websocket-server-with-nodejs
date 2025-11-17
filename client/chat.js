(() => {
  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("messageList");
  const template = document.getElementById("messageTemplate");
  const form = document.getElementById("chatForm");
  const nicknameInput = document.getElementById("nickname");
  const messageInput = document.getElementById("message");

  let socket;
  const messages = [];
  const WS_PATH = "/ws/"; // Must mirror docs/nginx/cyberpi.tech.conf
  const DEFAULT_WS_PORT = 23333; // Node backend listens here (proxied by Nginx)
  const RECONNECT_BASE_DELAY = 800;
  const RECONNECT_MAX_DELAY = 12000;
  const PORT_PLAN = Object.freeze({
    nginx: "80/443",
    websocket: DEFAULT_WS_PORT,
    futureApi: "3000-4000",
  });
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  const NotificationBridge = (() => {
    const supported = "Notification" in window;
    let permissionState = supported ? Notification.permission : "denied";
    let pendingRequest = null;

    const requestPermission = () => {
      if (!supported) {
        return Promise.resolve("denied");
      }
      if (permissionState === "granted" || permissionState === "denied") {
        return Promise.resolve(permissionState);
      }
      if (!pendingRequest) {
        pendingRequest = Notification.requestPermission()
          .then((result) => {
            permissionState = result;
            pendingRequest = null;
            return result;
          })
          .catch((err) => {
            console.warn("[nytoy] 系统通知权限申请失败", err);
            permissionState = "denied";
            pendingRequest = null;
            return "denied";
          });
      }
      return pendingRequest;
    };

    const notify = (title, body) => {
      if (!supported) {
        return;
      }
      const spawnNotification = () => {
        try {
          new Notification(title, {
            body,
            tag: "nytoy-chat",
            renotify: true,
          });
        } catch (error) {
          console.warn("[nytoy] 系统通知弹出失败", error);
        }
      };

      if (permissionState === "granted") {
        spawnNotification();
        return;
      }

      if (permissionState === "default") {
        requestPermission().then((result) => {
          if (result === "granted") {
            spawnNotification();
          }
        });
      }
    };

    return {
      isSupported: () => supported,
      requestPermission,
      notify,
    };
  })();
  const shouldNotify = () => {
    if (!NotificationBridge.isSupported()) {
      return false;
    }
    const hidden = typeof document.hidden === "boolean" ? document.hidden : false;
    const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    return hidden || !hasFocus;
  };

  console.info(
    "[nytoy]",
    "WS via reverse proxy:",
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}${WS_PATH}`,
    "-> 127.0.0.1:" + DEFAULT_WS_PORT
  );
  console.info("[nytoy] 多服务端口规划:", PORT_PLAN);
  console.info(
    "[nytoy] forever/PM2 提醒: 生产环境务必配置 --minUptime/--spinSleepTime 或 pm2 save，避免进程崩溃后 WS 重连风暴。"
  );

  const setStatus = (text, modifier) => {
    statusEl.textContent = text;
    statusEl.classList.remove("status--connected", "status--error");
    if (modifier) {
      statusEl.classList.add(modifier);
    }
  };

  const renderMessages = () => {
    listEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    messages.slice(-200).forEach((msg) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector(".message__nickname").textContent = msg.nickname || "匿名";
      node.querySelector(".message__time").textContent = new Date(msg.timestamp).toLocaleTimeString();
      node.querySelector(".message__content").textContent = msg.content;
      if (msg.self) {
        node.classList.add("message--me");
      }
      fragment.appendChild(node);
    });
    listEl.appendChild(fragment);
    listEl.scrollTop = listEl.scrollHeight;
  };

  const appendMessage = (payload) => {
    messages.push({
      nickname: payload.nickname,
      content: payload.content,
      timestamp: payload.timestamp || Date.now(),
      self: Boolean(payload.self),
    });
    renderMessages();
  };

  const resolveSocketUrl = () => {
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
  };

  const scheduleReconnect = () => {
    reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY * reconnectAttempts, RECONNECT_MAX_DELAY);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
    setStatus(`reconnecting in ${Math.round(delay / 100) / 10}s…`, "status--error");
  };

  const connect = () => {
    clearTimeout(reconnectTimer);
    const target = resolveSocketUrl();
    setStatus(`connecting ${target.startsWith("wss") ? "secure" : "ws"}…`);
    try {
      socket = new WebSocket(target);
    } catch (err) {
      console.error("WebSocket init failed", err);
      setStatus("connect error", "status--error");
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      setStatus("connected", "status--connected");
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected", "status--error");
      scheduleReconnect();
    });

    socket.addEventListener("error", (err) => {
      console.error("ws error", err);
      setStatus("error", "status--error");
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.content) {
          appendMessage({
            nickname: data.nickname || "匿名",
            content: data.content,
            timestamp: Date.now(),
          });
          if (shouldNotify()) {
            NotificationBridge.notify(`${data.nickname || "匿名"} 发来新消息`, data.content);
          }
        }
      } catch (error) {
        console.warn("Bad message payload", event.data);
      }
    });
  };

  form.addEventListener("submit", (evt) => {
    evt.preventDefault();
    const nickname = nicknameInput.value.trim();
    const content = messageInput.value.trim();
    if (!nickname || !content || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const payload = { nickname, content };
    socket.send(JSON.stringify(payload));
    appendMessage({ ...payload, self: true });
    messageInput.value = "";
    messageInput.focus();
  });

  setStatus("connecting…");
  connect();
  if (NotificationBridge.isSupported()) {
    NotificationBridge.requestPermission();
  }
})();
