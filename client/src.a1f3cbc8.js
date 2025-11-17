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
          <input id="message" class="_textFeild_17dbd_1" type="text" placeholder="请输入消息内容" maxlength="200"/>
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
    if (window.NYTOY_WS_ENDPOINT) {
      return window.NYTOY_WS_ENDPOINT;
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const port = window.location.port || "23333";
    return `${protocol}://${host}${port ? `:${port}` : ""}`;
  }

  function connect() {
    try {
      socket = new WebSocket(resolveSocketUrl());
    } catch (err) {
      console.error("WebSocket init error", err);
      return;
    }

    socket.addEventListener("open", () => {
      console.log("ws connected");
    });

    socket.addEventListener("close", () => {
      console.warn("ws closed, retrying…");
      setTimeout(connect, 1500);
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
