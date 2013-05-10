
var lib1Helper = require( "./lib1_helper.js" );

exports.identify = function() {
	var a = "sdfsdf";
	return "i am lib1.  i depend on my little helper: " + lib1Helper.identify();
};
