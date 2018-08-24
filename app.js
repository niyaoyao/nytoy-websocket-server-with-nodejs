var express = require('express');
var http = require('http');
var WebSocket = require('ws');
var app = express();
var port = 23333;


app.use('/wsdemo', express.static(__dirname + '/wsdemo'));

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
wss.on('connection', function (socket) {
	console.log('connection open');
	// body...
	// var id = setInterval(function () {
	// 	// body...
	// 	socket.send(JSON.stringify(new Date()), function() {  })
	// }, 5000);


	socket.on('message', function (message) {
		// body...
		console.log('recieve:' + message + '[' + typeof message + ']');

		var msg = {};
		try {
    			msg = JSON.parse(message);
  	} catch(e) {
   		// var addr = ws._socket.address();
    	msg = message;
    	console.log('bad websocket message datatype:' + typeof message);
 		}

		console.log('msg.content:' + msg.content + '[' + typeof msg + ']');
		console.log('msg[\'content\']:' + msg['content'] + '[' + typeof msg + ']');

	});


	socket.on('close', function () {
		// body...
		console.log('connection close');
		// clearInterval(id);
	});
});
