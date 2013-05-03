var assetBundlerUtil = require( "./lib/util.js" );

module.exports = function( rootDir, staticDir, appPagesDir ) {

	//var bundleMap = assetBundlerUtil.readBundleMap();
	var pageMap = assetBundlerUtil.readPageMap();
	//var bundlerConfig = assetBundlerUtil.readBundlerConfig();

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
