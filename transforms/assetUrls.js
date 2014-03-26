var through = require('through');
var resolve = require( "resolve" );
var path = require( "path" );
var pathMapper = require( "path-mapper" );

module.exports = function( file, options ) {
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

			var url = pathMapper( assetSrcAbsPath, function( srcDir ) {
				return options.packagePathsToIds[ srcDir ] ? '/' + options.packagePathsToIds[ srcDir ] : null; // return val of outputDirPath needs to be absolute path
			} );

			// all assets urls should be different than their paths.. otherwise we have a problem
			if( url === assetSrcAbsPath )
				return _this.emit( 'error', new Error( 'The file "' + assetSrcAbsPath + '" referenced from ##url( "' + assetSrcPath + '" ) in file "' + file + '" is not an asset.' ) );

			if( options.outputDirUrl ) {
				var baseUrl = options.outputDirUrl[0] === path.sep ? options.outputDirUrl.slice(1) : options.outputDirUrl;
				url = baseUrl + url;
			}

			return url;
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};