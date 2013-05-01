var assetBundlerUtil = require( "./assetBundlerUtil.js" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	path = require( "path" ),
	fs = require( "fs" );


function resolveAndInjectDependencies( pagePath, bundleMap, pageMap, assetBundlerConfig, rootDir, staticDir, req, res) {

	console.log( pagePath );

	var pageMetadata = pageMap[ pagePath ];

	var jsScriptEls = "";
	var cssLinkEls = "";
	var tmplContents = "";
	var files = [];

	var relativeAssetLibraryDir = path.join( rootDir, assetBundlerConfig.assetLibraryDest).replace( staticDir, "");
	var relativeAppPagesDir = path.join( rootDir, assetBundlerConfig.appPagesDest).replace( staticDir, "");


	//console.log( "relativeAssetLibraryDir: " + relativeAssetLibraryDir );
	//console.log( "relativeAppPagesDir: " + relativeAppPagesDir );

	_.each( pageMetadata.requiredBundles, function( bundleName ) {

		var bundle = bundleMap[ bundleName ];

		if( ! bundle.keepSeparate ) {
			_.each( bundle.files, function( fileName ) {
				//files.push( fileName.replace( "{ASSET_LIBRARY}/", "/AssetLibrary-assets" ) );
				//files.push( fileName.replace( "{ASSET_LIBRARY}/", "/" + rootDir + path.sep + assetBundlerConfig.assetLibraryDest ) );
				files.push( fileName.replace( "{ASSET_LIBRARY}/", relativeAssetLibraryDir ) );
			} );
		}

		files = _.uniq( files );

		console.log( files );

		_.each( bundle.keepSeparateBundleFiles, function( fileName ) {
			//files.push( "/AssetLibrary-assets/" + fileName );
			//files.push( "/" + assetBundlerConfig.assetLibraryDest + fileName );
			files.push( relativeAssetLibraryDir + fileName );
		} );

	} );

	_.each( pageMetadata.files, function( file ) {
		//files.push( file.replace( "{APP_PAGES}", "/" + assetBundlerConfig.appPagesDest ) );
		files.push( file.replace( "{APP_PAGES}", relativeAppPagesDir ) );
	} );

	_.each( files, function( fileName ) {
		if( _s.endsWith( fileName, ".js" ) )
			jsScriptEls += "<script type='text/javascript' src='" + fileName + "'></script>\n";
		else if( _s.endsWith( fileName, ".css" ) )
			cssLinkEls += "<link rel='stylesheet' href='" + fileName + "'></script>\n";
		else if( _s.endsWith( fileName, ".tmpl" ) ) {
			//tmplContents += fs.readFileSync( rootDir + fileName) + "\n";
			tmplContents += fs.readFileSync( staticDir + fileName) + "\n";
		}
			

	} );

	//res.render( path, { js_files : jsScriptEls, css_files : cssLinkEls, tmpl_contents : tmplContents } );

	res.locals.js_files = jsScriptEls;
	res.locals.css_files = cssLinkEls;
	res.locals.tmpl_contents = tmplContents;

	//console.log( jsScriptEls + "\n" + cssLinkEls + "\n" + tmplContents);

}

module.exports = function( rootDir, staticDir, appPagesDir ) {

	var bundleMap = assetBundlerUtil.readBundleMap();
	var pageMap = assetBundlerUtil.readPageMap();
	var bundlerConfig = assetBundlerUtil.readBundlerConfig();

	return function( req, res, next ) {

		var oldRender = res.render;

		//console.log( "rootDir: " + rootDir );
		//console.log( "staticDir: " + staticDir );
		//console.log( "appPagesDir: " + appPagesDir );

		res.render = function() {
			var path = arguments[0];

			resolveAndInjectDependencies( path.replace( appPagesDir, "" ).substring( 1 ) , bundleMap, pageMap, bundlerConfig, rootDir, staticDir, null, res );

			oldRender.apply( res, arguments );
		};

		next();
	};
};