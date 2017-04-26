
var logger = require("./logger")('Forever'); // logger iséo

logger.info('---== Starting fm-server.js ...==---');
console.log('---== Starting fm-server.js ...==---');

var path = require('path');
var forever = require('forever-monitor');

var tracepath = path.normalize( process.env.HOME + '/trace/' );

var child = new( forever.Monitor )('server.js', {
	silent : true,
	args : ['monitored'],
	outFile: tracepath + 'server-out.log', // Path to log output from child stdout
	errFile: tracepath + 'server-err.log'  // Path to log output from child stderr
});

child.on('exit:code', function(code) {
	logger.info('detected script exited with code ' + code);
});

child.on('restart', function() {
    console.log('restarting server.js ... (restart count =%d)', child.times );
    logger.info('restarting server.js ... (restart count =%d)', child.times );
});

// lance le script server.js et le relance si celui ci s'arrete

child.start();
