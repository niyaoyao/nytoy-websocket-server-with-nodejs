var express = require('express');
var http = require('http');
var WebSocket = require('ws');

var app = express();
var port = process.env.PORT || 23333;

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

        const msgData = {
            content: msg.content,
            nickname: msg.nickname
        };

        // 广播给其他客户端
        wss.broadcast(msgData, socket);
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
