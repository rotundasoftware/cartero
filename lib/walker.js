var fs = require( "fs" ),
	_ = require( "underscore" ),
	path = require( "path" );

function Walker( startDirectory ) {
	this.pwd = startDirectory;
}

/** Public functions **/

Walker.prototype.cd = function( newDir ) {
	if( newDir[0] === path.sep ) {
		this.pwd = newDir;
	}
	else {
		this.pwd += path.sep + newDir;
	}
};

Walker.prototype.cat = function( fileName ) {
	var fileContents = fs.readFileSync( this.fullPath( fileName ) );
	return fileContents;
};

Walker.prototype.fullPath = function( fileName ) {
	return this.pwd + path.sep + fileName;
};

Walker.prototype.ls = function() {
	var _this = this;
	var files = fs.readdirSync( _this.pwd );
	var allFileStats = {};

	_.each( files, function( fileName ) {
		allFileStats[ fileName ] = fs.statSync( _this.pwd + path.sep + fileName );
	} );

	return allFileStats;
};

module.exports = Walker;