var through = require('through');
var path = require('path');

module.exports = function (file, options) {
	var data = '';
	var options = options || {};
	if (file !== undefined && path.extname(file) !== '.css') {
		return through();
	} else {
		return through(write, end);
	}

	function write(buffer) {
		data += buffer;
	}

	function end() {
		var that = this;
		// Simulate the stream to take some time to end so we can test for any race
		// conditions.
		setTimeout(function() {
			that.queue(data);
			that.queue(null);
		}, 2000);
	}
};
