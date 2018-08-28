var express = require('express');
var http = require('http');
var WebSocket = require('ws');
var app = express();
var port = 23333;


app.use('/app', express.static(__dirname + '/client'));

app.get('/', function(req, res) {
	res.send('<h1>Hello, Welcome to NY</h1>');
});

// var server = app.listen(port, function(){
// 	console.log('http://%s:%s', server.address().address , server.address().port);
// });
var server = http.createServer(app);
server.listen(port);
console.log('server start');

var wss = new WebSocket.Server({server: server});

wss.broadcast = function broadcast(data) {
	// body...
	wss.cliens.forEach(function each(client) {
		// body...
		if (client.readyState === WebSocket.OPEN ) {
			client.send(JSON.stringify(data));
		}
	});
}

wss.on('connection', function (socket, request) {
	// body...
	// var id = setInterval(function () {
	// 	// body...
	// 	socket.send(JSON.stringify(new Date()), function() {  })
	// }, 5000);

	const ip = request.connection.remoteAddress;
	console.log('connection open: ' + ip );
	

	socket.on('message', function (message) {
		// body...
		console.log('recieve:' + message + '[' + typeof message + ']');

		var msg = {};
		try {
    			msg = JSON.parse(message);
    	} catch(e) {
	    	msg = message;
	    	console.log('ERROR: Bad websocket message datatype:' + typeof message);
	    	return;
	 	}

		console.log('msg.content:' + msg.content + '[' + typeof msg + ']');
		console.log('msg[\'content\']:' + msg['content'] + '[' + typeof msg + ']');
		// broadcast everyone else
		wss.clients.forEach(function each(client) {
			// body...
			if (client !== socket && client.readyState === WebSocket.OPEN) {
				var msgData = {
					"content": msg.content,
					"nickname": msg.nickname
				}					
				client.send(JSON.stringify(msgData));
			}
		});

	});


	socket.on('close', function () {
		// body...
		console.log('connection close');
		// clearInterval(id);
	});
});
