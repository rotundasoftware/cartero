var assetBundlerUtil = require( "./lib/util.js" );

module.exports = function( rootDir, staticDir, appPagesDir ) {

	var pageMap;

	try {
		pageMap = assetBundlerUtil.readPageMap();
	}
	catch( e ) {
		throw new Error( "Error while reading pageMap file. Please run the grunt assetbundler task before running your application." );
	}

	return function( req, res, next ) {

		var oldRender = res.render;

		res.render = function( path, options ) {
			var pageMapKey = options && options.bundler_pageMapKey ? options.bundler_pageMapKey : path.replace( appPagesDir, "" ).substring( 1 );
			console.log( pageMapKey );
			
			var pageMetadata = pageMap[ pageMapKey ];
			if( ! pageMetadata ) return next( new Error( "Could not find pageKey " + pageMapKey + " in page key map." ) );

			res.locals.bundler_js = pageMetadata.bundler_js;
			res.locals.bundler_css = pageMetadata.bundler_css;
			res.locals.bundler_tmpl = pageMetadata.bundler_tmpl;

			oldRender.apply( res, arguments );
		};

		next();
	};
};
