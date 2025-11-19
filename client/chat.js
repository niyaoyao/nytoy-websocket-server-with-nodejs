(() => {
  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("messageList");
  const template = document.getElementById("messageTemplate");
  const form = document.getElementById("chatForm");
  const nicknameInput = document.getElementById("nickname");
  const messageInput = document.getElementById("message");
  const imageButton = document.getElementById("imageButton");
  const imageInput = document.getElementById("imagePicker");
  const aiButton = document.getElementById("aiButton");
  const AI_KEYWORD = "@bot";
  const AI_NICKNAME = "bot";
  const AI_PLACEHOLDER_TEXT = "AI 思考中…";
  const pendingAiReplies = new Map();

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
  const createAiRequestId = () => `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const containsAiKeyword = (text) => typeof text === "string" && text.toLowerCase().includes(AI_KEYWORD);
  const spawnAiPlaceholder = (requestId, nickname = AI_NICKNAME) => {
    if (!requestId) {
      return;
    }
    const placeholder = {
      id: requestId,
      nickname,
      content: AI_PLACEHOLDER_TEXT,
      type: "text",
      timestamp: Date.now(),
      self: false,
      isBot: true,
      pending: true,
    };
    pendingAiReplies.set(requestId, placeholder);
    messages.push(placeholder);
    renderMessages();
  };
  const resolveAiPlaceholder = (incoming) => {
    const requestId = typeof incoming.aiRequestId === "string" ? incoming.aiRequestId : "";
    if (!requestId || !pendingAiReplies.has(requestId)) {
      return false;
    }
    const placeholder = pendingAiReplies.get(requestId);
    placeholder.content = incoming.content;
    placeholder.nickname = incoming.nickname || AI_NICKNAME;
    placeholder.timestamp = incoming.timestamp || Date.now();
    placeholder.pending = false;
    pendingAiReplies.delete(requestId);
    renderMessages();
    return true;
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

  const isSocketReady = () => socket && socket.readyState === WebSocket.OPEN;

  const renderMessages = () => {
    listEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    messages.slice(-200).forEach((msg) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector(".message__nickname").textContent = msg.nickname || "匿名";
      node.querySelector(".message__time").textContent = new Date(msg.timestamp).toLocaleTimeString();
      const contentEl = node.querySelector(".message__content");
      contentEl.textContent = "";
      if (msg.type === "image" && typeof msg.content === "string") {
        const img = document.createElement("img");
        img.src = msg.content;
        img.alt = `${msg.nickname || "匿名"} 的图片消息`;
        img.className = "message__image";
        contentEl.appendChild(img);
      } else {
        contentEl.textContent = msg.content;
      }
      if (msg.self) {
        node.classList.add("message--me");
      }
      if (msg.pending) {
        node.classList.add("message--pending");
        if (!contentEl.textContent) {
          contentEl.textContent = AI_PLACEHOLDER_TEXT;
        }
      }
      fragment.appendChild(node);
    });
    listEl.appendChild(fragment);
    listEl.scrollTop = listEl.scrollHeight;
  };

  const appendMessage = (payload) => {
    messages.push({
      id: payload.id || payload.aiRequestId || null,
      nickname: payload.nickname,
      content: payload.content,
      type: payload.type || "text",
      timestamp: payload.timestamp || Date.now(),
      self: Boolean(payload.self),
      isBot: Boolean(payload.isBot),
      pending: Boolean(payload.pending),
    });
    renderMessages();
  };

  const sendPayload = (payload) => {
    if (!payload.nickname || !payload.content || !isSocketReady()) {
      return false;
    }
    try {
      socket.send(JSON.stringify(payload));
      appendMessage({ ...payload, self: true, timestamp: Date.now() });
    } catch (error) {
      console.warn("发送消息失败", error);
      return false;
    }
    return true;
  };

  const sendTextMessage = () => {
    const nickname = nicknameInput.value.trim();
    const content = messageInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    if (!content) {
      return;
    }
    const needsAi = containsAiKeyword(content);
    const aiRequestId = needsAi ? createAiRequestId() : "";
    const payload = { nickname, content, type: "text" };
    if (needsAi) {
      payload.ai = true;
      payload.aiRequestId = aiRequestId;
    }
    if (sendPayload(payload)) {
      messageInput.value = "";
      messageInput.focus();
      if (needsAi && aiRequestId) {
        spawnAiPlaceholder(aiRequestId);
      }
    }
  };

  const handleImageFile = (file) => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    if (!file || !file.type || !file.type.startsWith("image/")) {
      return;
    }
    if (!isSocketReady()) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        sendPayload({ nickname, content: result, type: "image" });
      }
    };
    reader.onerror = () => {
      console.warn("读取图片失败");
    };
    reader.readAsDataURL(file);
  };

  const sendAiQuestion = () => {
    const nickname = nicknameInput.value.trim();
    const content = messageInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    if (!content) {
      messageInput.focus();
      return;
    }
    const aiRequestId = createAiRequestId();
    const payload = { nickname, content, type: "text", ai: true, aiRequestId };
    if (sendPayload(payload)) {
      messageInput.value = "";
      messageInput.focus();
      spawnAiPlaceholder(aiRequestId);
    }
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
          const messageType = data.type === "image" ? "image" : "text";
          const botNickname = data.isBot ? data.nickname || AI_NICKNAME : data.nickname || "匿名";
          const handledByPlaceholder =
            data.isBot &&
            resolveAiPlaceholder({
              aiRequestId: data.aiRequestId,
              content: data.content,
              nickname: botNickname,
              timestamp: data.timestamp,
            });
          if (!handledByPlaceholder) {
            appendMessage({
              nickname: botNickname,
              content: data.content,
              type: messageType,
              timestamp: data.timestamp || Date.now(),
              isBot: Boolean(data.isBot),
              aiRequestId: data.aiRequestId,
            });
          }
          if (shouldNotify()) {
            const summary = messageType === "image" ? "[图片]" : data.content;
            NotificationBridge.notify(`${botNickname}${data.isBot ? "（AI）" : ""} 发来新消息`, summary);
          }
        }
      } catch (error) {
        console.warn("Bad message payload", event.data);
      }
    });
  };

  form.addEventListener("submit", (evt) => {
    evt.preventDefault();
    sendTextMessage();
  });

  if (aiButton) {
    aiButton.addEventListener("click", () => {
      sendAiQuestion();
    });
  }

  if (imageButton && imageInput) {
    imageButton.addEventListener("click", () => {
      if (!nicknameInput.value.trim()) {
        nicknameInput.focus();
        return;
      }
      imageInput.click();
    });

    imageInput.addEventListener("change", (evt) => {
      const { files } = evt.target;
      if (files && files[0]) {
        handleImageFile(files[0]);
      }
      evt.target.value = "";
    });
  }

  document.addEventListener("paste", (evt) => {
    const items = evt.clipboardData && evt.clipboardData.items;
    if (!items) {
      return;
    }
    const imageItem = Array.from(items).find(
      (item) => item.kind === "file" && typeof item.type === "string" && item.type.startsWith("image/")
    );
    if (!imageItem) {
      return;
    }
    const file = imageItem.getAsFile();
    if (file) {
      evt.preventDefault();
      handleImageFile(file);
    }
  });

  setStatus("connecting…");
  connect();
  if (NotificationBridge.isSupported()) {
    NotificationBridge.requestPermission();
  }
})();
