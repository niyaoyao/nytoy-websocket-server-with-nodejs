(() => {
  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("messageList");
  const template = document.getElementById("messageTemplate");
  const form = document.getElementById("chatForm");
  const nicknameInput = document.getElementById("nickname");
  const messageInput = document.getElementById("message");

  let socket;
  const messages = [];

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
    if (window.NYTOY_WS_ENDPOINT) {
      return window.NYTOY_WS_ENDPOINT;
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const port = window.location.port || "23333";
    return `${protocol}://${host}${port ? `:${port}` : ""}`;
  };

  const connect = () => {
    try {
      socket = new WebSocket(resolveSocketUrl());
    } catch (err) {
      console.error("WebSocket init failed", err);
      setStatus("connect error", "status--error");
      return;
    }

    socket.addEventListener("open", () => {
      setStatus("connected", "status--connected");
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected", "status--error");
      setTimeout(connect, 1000);
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
})();
