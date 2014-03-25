var through = require('through');
var resolve = require( "resolve" );
var path = require( "path" );

module.exports = function( file ) {

	// this is kind of a hack. the problem is that the only time we can apply transforms to individual javascript
	// files is using the browserify global transform. however, at the time those transforms are run we
	// do not yet know all our package ids, so we can't map the src path the the url yet. but we do need to
	// resolve relative paths at this time, because once the js files are bundled the tranform will be
	// passed a new path (that of the bundle), and we no longer be able to resolve those relative paths.
	// Therefore for the case of js files we do this transform in two phases. The first is to resolve the
	// src file to an absolute path (which we do using a browserify global transform), and the second is
	// to resolve that absolute path to a url (which we do once we know all our package ids).

	var data = '';

	return through( write, end );

	function write( buf ) {
		var _this = this;
		var res = buf.toString( 'utf8' );

		res = res.replace( /##url\(\ *(['"])([^']*)\1\ *\)/, function( wholeMatch, quote, assetSrcPath ) {
			try {
				assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
			} catch ( err ) {
				return _this.emit( 'error', new Error( 'Could not resolve ##url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
			}

			return '##url(' + quote + assetSrcAbsPath + quote + ')';
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};