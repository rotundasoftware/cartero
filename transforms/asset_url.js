var _ = require('underscore');
var through = require('through');
var resolve = require( "resolve" );
var path = require( "path" );

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

			var newFilePathRelativeToOutputDir = options.assetMap[ path.relative( options.appRootDir, assetSrcAbsPath ) ];

			if( _.isUndefined( newFilePathRelativeToOutputDir ) ) {
				throw new Error( 'There is no asset with the path "' + assetSrcPath + '". (If this is an image, has it been included in the package.json of its module with the "image" key?)' );
			}
			
			// urls are symmetric to paths
			url = newFilePathRelativeToOutputDir; // ex: <packageId>/image/photo_<shasum>.png

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
