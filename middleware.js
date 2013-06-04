var assetBundlerUtil = require( "./lib/util.js" ),
	fs = require( "fs" ),
	_ = require( "underscore" ),
	path = require( "path" );

module.exports = function( rootDir, staticDir, appPagesDir ) {

	var pageMap;
	var configMap;
	var mode;

	try {
		pageMap = assetBundlerUtil.readPageMap();
		configMap = assetBundlerUtil.readBundlerConfig();
		mode = configMap.mode;
	}
	catch( e ) {
		throw new Error( "Error while reading pageMap file. Please run the grunt assetbundler task before running your application." );
	}

	return function( req, res, next ) {

		var oldRender = res.render;

		res.render = function( requestPath, options ) {
			var pageMapKey = options && options.bundler_pageMapKey ? options.bundler_pageMapKey : requestPath.replace( appPagesDir, "" ).substring( 1 );
			console.log( pageMapKey );
			
			var pageMetadata = pageMap[ pageMapKey ][ mode ];
			if( ! pageMetadata ) return next( new Error( "Could not find pageKey " + pageMapKey + " in page key map." ) );

			res.locals.bundler_js = _.map( pageMetadata.js, function( fileName ) {
				return "<script type='text/javascript' src='/" + fileName + "'></script>";
			} ).join( "" );

			res.locals.bundler_css = _.map( pageMetadata.css, function( fileName ) {
				return "<link rel='stylesheet' href='/" + fileName + "'></link>";
			} ).join( "" );

			if( mode === "dev" ) {
				res.locals.bundler_tmpl = _.map( pageMetadata.tmpl, function( fileName ) {
					return fs.readFileSync( staticDir + path.sep + fileName ).toString();
				} ).join( "" );
			}
			else {
				res.locals.bundler_tmpl = pageMetadata.tmpl_cache.join( "" );
			}

			oldRender.apply( res, arguments );
		};

		next();
	};
};
