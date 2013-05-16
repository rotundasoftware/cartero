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

		res.render = function() {
			var path = arguments[0];

			var pageMetadata = pageMap[ path.replace( appPagesDir, "" ).substring( 1 ) ];

			res.locals.bundler_js = pageMetadata.bundler_js;
			res.locals.bundler_css = pageMetadata.bundler_css;
			res.locals.bundler_tmpl = pageMetadata.bundler_tmpl;

			oldRender.apply( res, arguments );
		};

		next();
	};
};
