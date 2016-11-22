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

			var resolvedRealPath = fs.realpathSync( resolvedPath );
		
			if( ! options.appRootDir ) return resolvedRealPath;

			var relativePath = path.relative( options.appRootDir, resolvedRealPath );

			var relativePathItems = relativePath.split( '/' );
			if( relativePathItems[ 0 ] === '..' ) {
				// uff, the file we are resolving is OUTSIDE of the root dir of the
				// application. This happens when a symlinked module (i.e. using npm link)
				// has a ##resolve transform that references a file in another symlinked
				// module. The 'file' argument that browserify passes to this transform
				// method is a real path, but we want it to be the symlinked path, so that
				// all our "resolves" give us paths inside the app root dir. Clearly,
				// reconstructing the symlinked path given the real path is not straight
				// forward. I'm not even sure why the below logic works, but it does.
				// Will leave it alone for now!

				// try again using symlinked path
				relativePath = path.relative( options.appRootDir, resolvedPath );
				relativePathItems = relativePath.split( '/' );

				if( relativePathItems[ 0 ] === '..' ) {
					// still didn't work. now we presume that at some point last part of the
					// symlinked path is going to mirror what we have relative to the app root dir.
					// this generally works because after the node_modules part, they are both the same.
					// so we keep chopping off the start of the symlinked path until we find a file
					// that is in that location relative to the app root dir. again, not 100% sure
					// this works for all cases, but seems to work for ours.

					do {
						relativePathItems.shift();
					} while(
						relativePathItems.length &&
						! fs.existsSync( path.join( options.appRootDir, relativePathItems.join( '/' ) ) )
					)

					if( relativePathItems.length ) {
						relativePath = relativePathItems.join( '/' );
					}
				}
			}

			return relativePath;
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};
