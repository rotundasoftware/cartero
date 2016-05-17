var through = require('through');
var resolve = require( "resolve" );
var path = require( 'path' );
var fs = require( 'fs' );

module.exports = function( file, options ) {
	var data = '';
	var options = options || {};

	return through( write, end );

	function write( buf ) {
		var _this = this;
		var res = buf.toString( 'utf8' );

		res = res.replace( /##resolve\(\ *(['"])([^'"]*)\1\ *\)/g, function( wholeMatch, quote, unresolvedPath ) {
			var resolvedPath;

			try {
				resolvedPath = resolve.sync( unresolvedPath, { basedir : path.dirname( file ) } );
			} catch( err ) {
				return _this.emit( 'error', new Error( 'Could not resolve ##resolve( "' + unresolvedPath + '" ) in file "' + file + '": ' + err ) );
			}

			resolvedPath = fs.realpathSync( resolvedPath );

			if( options.appRootDir ) {
				resolvedPath = path.relative( options.appRootDir, resolvedPath );
			}

			return resolvedPath;
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};
