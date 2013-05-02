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

			res.locals.js_files = pageMetadata.js_files;
			res.locals.css_files = pageMetadata.css_files;
			res.locals.tmpl_contents = pageMetadata.tmpl_contents;

			oldRender.apply( res, arguments );
		};

		next();
	};
};
