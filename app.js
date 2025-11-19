var express = require('express');
var http = require('http');
var https = require('https');
var WebSocket = require('ws');

var app = express();
var port = process.env.PORT || 23333;
var AI_CONFIG = {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-small-3.1-24b-instruct:free',
    nickname: process.env.CHAT_AI_NICKNAME || 'bot',
    referer: process.env.OPENROUTER_SITE_URL || 'https://nytoy-chatroom.local',
    siteTitle: process.env.OPENROUTER_SITE_NAME || 'nytoy-chatroom',
    systemPrompt: process.env.CHAT_AI_PROMPT || 'You are a concise and friendly assistant living inside a casual Chinese chatroom called 摸鱼聊天室. Prefer Simplified Chinese unless the user clearly uses another language, keep answers under 2000 Chinese characters when possible, and ignore any requests unrelated to conversation help.'
};

// 静态文件
app.use('/chatroom', express.static(__dirname + '/client'));

app.get('/', function(req, res) {
    res.send('<h1>Hello, Welcome to NY</h1>');
});

// 创建 HTTP + WS 共用服务器
var server = http.createServer(app);
server.listen(port, () => {
    console.log('Server started on port ' + port);
});

// 创建 WebSocket server
var wss = new WebSocket.Server({ server });

// WebSocket 广播
wss.broadcast = function(data, excludeSocket = null) {
    wss.clients.forEach(client => {
        if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (err) {
                console.error('Broadcast error:', err);
            }
        }
    });
};

function requestOpenRouterCompletion(question, askedBy) {
    return new Promise((resolve, reject) => {
        if (!AI_CONFIG.apiKey) {
            return reject(new Error('AI disabled'));
        }
        const trimmed = (question || '').trim();
        if (!trimmed) {
            return resolve('');
        }

        const payload = JSON.stringify({
            model: AI_CONFIG.model,
            messages: [
                { role: 'system', content: AI_CONFIG.systemPrompt },
                { role: 'user', content: `来自用户【${askedBy || '匿名'}】的提问：${trimmed}` }
            ]
        });

        const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${AI_CONFIG.apiKey}`,
                'HTTP-Referer': AI_CONFIG.referer,
                'X-Title': AI_CONFIG.siteTitle,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, res => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`OpenRouter HTTP ${res.statusCode}: ${raw}`));
                }
                try {
                    const parsed = JSON.parse(raw);
                    const reply = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
                    resolve((reply || '').trim());
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function notifyAiError(socket, message, requestId = null) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            content: message,
            nickname: AI_CONFIG.nickname,
            type: 'text',
            isBot: true,
            aiRequestId: requestId || null
        }));
    }
}

function handleAiQuestion(content, nickname, socket, requestId = null) {
    const questionText = typeof content === 'string' ? content.trim() : '';
    if (!questionText) {
        notifyAiError(socket, 'AI 提问内容不能为空。', requestId);
        return;
    }
    if (!AI_CONFIG.apiKey) {
        notifyAiError(socket, 'AI 机器人尚未配置 OPENROUTER_API_KEY。', requestId);
        return;
    }
    requestOpenRouterCompletion(questionText, nickname)
        .then(reply => {
            if (!reply) {
                notifyAiError(socket, 'AI 没有生成内容，请尝试换个提问方式。', requestId);
                return;
            }
            const aiMessage = {
                content: reply,
                nickname: AI_CONFIG.nickname,
                type: 'text',
                isBot: true,
                timestamp: Date.now(),
                aiRequestId: requestId || null
            };
            wss.broadcast(aiMessage);
        })
        .catch(err => {
            console.error('AI bot error:', err && err.message ? err.message : err);
            notifyAiError(socket, 'AI 机器人暂时不可用，请稍后再试。', requestId);
        });
}

// 心跳检测，防掉线（30 秒）
function heartbeat() {
    this.isAlive = true;
}

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('Terminating inactive client');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// WebSocket 连接事件
wss.on('connection', function(socket, request) {
    // 标记连接存活
    socket.isAlive = true;
    socket.on('pong', heartbeat);

    // 获取客户端真实 IP
    const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    console.log('WS connection from:', ip);

    socket.on('message', function(message) {
        console.log('Received:', message);

        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON message:', e);
            return;
        }

        const contentText = typeof msg.content === 'string' ? msg.content : '';
        const aiRequestId = typeof msg.aiRequestId === 'string' ? msg.aiRequestId.slice(0, 64) : null;
        const wantsAi = Boolean(msg.ai) || (msg.type !== 'image' && contentText && contentText.toLowerCase().includes('@bot'));
        const msgData = {
            content: msg.content,
            nickname: msg.nickname,
            type: msg.type === 'image' ? 'image' : 'text',
            isBot: msg.isBot === true
        };

        // 广播给其他客户端
        wss.broadcast(msgData, socket);

        if (wantsAi && msgData.type === 'text') {
            handleAiQuestion(msgData.content, msgData.nickname, socket, aiRequestId);
        }
    });

    socket.on('close', function() {
        console.log('Client disconnected:', ip);
    });

    socket.on('error', function(err) {
        console.error('Socket error:', err);
    });
});

// 防止 Node 崩溃
process.on('uncaughtException', err => {
    console.error('Unhandled Exception:', err);
});

process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});
