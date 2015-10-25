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

		res = res.replace( /##asset_url\(\ *(['"])([^'"]*)\1\ *\)/g, function( wholeMatch, quote, assetSrcPath ) {
			try {
				assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
			} catch( err ) {
				return _this.emit( 'error', new Error( 'Could not resolve ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
			}

			var url = pathMapper( assetSrcAbsPath, function( srcDir ) {
				return options.packagePathsToIds[ srcDir ] ? '/' + options.packagePathsToIds[ srcDir ] : null; // return val of outputDirPath needs to be absolute path
			} );

			// all assets urls should be different than their paths.. otherwise we have a problem
			if( url === assetSrcAbsPath )
				return _this.emit( 'error', new Error( 'The file "' + assetSrcAbsPath + '" referenced from ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '" is not an asset.' ) );

			var filename = path.basename(assetSrcAbsPath);
			var newFilename = options.assetMap[assetSrcAbsPath];

			url = path.join( path.dirname( url ), newFilename);

			if( options.outputDirUrl ) {
				var baseUrl = options.outputDirUrl;

				// outputDirUrl is normalized to always end is a forward slash, so drop the forward slash from the beginning of url
				if( url[ 0 ] === path.sep ) url = url.slice( 1 );
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