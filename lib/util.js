var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	findit = require( "findit" );

var kBundleFileName = "bundle.json";

var defaultSubdirectoriesRegExpString = "/_.*/";

var bundleMetadata = {};
var pageMetadata = {};

var kPageSuffix = "swig";

var kAssetBundlerDir = __dirname + "/../output/";

var kBundleMapJSONFile = "bundleMap.json";
var kPageMapJSONFile = "pageMap.json";
var kBundlerConfigJSONFile = "config.json";

var kBundlerRequireDirective = "#bundler_require";
var kBundlerExtendsDirective = "#bundler_extends";
var bundlerRequireRegExp = new RegExp( "<\!-- " + kBundlerRequireDirective + " (.*?) -->" );
var bundlerExtendsRegExp = new RegExp( "<\!-- " + kBundlerExtendsDirective + " \"(.*?)\" -->" );

exports.saveBundleMap = function( bundleMap ) {
	fs.writeFileSync( kAssetBundlerDir + kBundleMapJSONFile, JSON.stringify( bundleMap, null, "\t" ) );
};

exports.readBundleMap = function() {
	return JSON.parse( fs.readFileSync( kAssetBundlerDir + kBundleMapJSONFile ) );
};

exports.savePageMap = function( pageMap ) {
	fs.writeFileSync( kAssetBundlerDir + kPageMapJSONFile, JSON.stringify( pageMap, null, "\t" ) );
};

exports.readPageMap = function() {
	return JSON.parse( fs.readFileSync( kAssetBundlerDir + kPageMapJSONFile ) );
};

exports.saveBundlerConfig = function( configMap ) {
	fs.writeFileSync( kAssetBundlerDir + kBundlerConfigJSONFile, JSON.stringify( configMap, null, "\t" ) );
};

exports.readBundlerConfig = function() {
	return JSON.parse( fs.readFileSync( kAssetBundlerDir + kBundlerConfigJSONFile ) );
};

function buildPagesMap( directory, rootDir, options ) {
	var walker = new Walker( directory );

	var files = walker.ls();

	var fileDependencies = [];

	var pageFiles = _.filter( _.keys( files ), function( fileName ) {

		return _s.endsWith( fileName, kPageSuffix );

	} );

	_.each( _.keys( files ), function( fileName ) {

		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {

			if( options.directoriesToIgnore.test( fileName ) ) return;

			if( _s.startsWith( fileName, "_" ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), exports.isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( assetFile.substring( rootDir.length ) );
				} ) );
			}
			else {
				buildPagesMap( walker.fullPath( fileName ), rootDir, options );
			}
		}
		else if( fileStats.isFile() ) {

			if( options.filesToIgnore.test( fileName ) ) return;

			//ignore templates
			if( _s.endsWith( fileName, kPageSuffix) ) return;

			if( exports.isAssetFile( fileName ) ) fileDependencies.push( walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1) );

		}
	} );

	_.each( pageFiles, function( fileName ) {
		var pageFileContents = fs.readFileSync( walker.fullPath( fileName ) ).toString();
		var pageName = walker.fullPath( fileName ).substring( rootDir.length + 1 );

		var requiredBundles = [];
		var extendsPage = null;

		var bundlerRequireMatches = bundlerRequireRegExp.exec( pageFileContents );

		if( !_.isNull( bundlerRequireMatches ) ) {
			console.log("BUNDLER_REQUIRE_MATCHES: " + bundlerRequireMatches[1] + " for " + fileName );
			requiredBundles = JSON.parse( "[" + bundlerRequireMatches[1] + "]" );
			console.log( requiredBundles );
		}

		var bundlerExtendsMatches = bundlerExtendsRegExp.exec( pageFileContents );

		if( !_.isNull( bundlerExtendsMatches ) ) {
			extendsPage = bundlerExtendsMatches[1];
		}

		pageMetadata[ pageName ] = {
			name : pageName,
			files : fileDependencies,
			requiredBundles : requiredBundles,
			extendsPage : extendsPage
		};
	} );

	return pageMetadata;
}

exports.buildPagesMap = function( dir, options ) {
	return buildPagesMap( dir, dir, options );
};

function resolvePagesMap( pagesMap, bundleMap ) {

	//is this too sketchy?
	function resolveFullPageName( pageName, relativePageName ) {

		var pageDir = pageName.replace( /[^\/]*$/, "");

		var tempPageDir = pageDir + relativePageName;

		do {
			pageDir = tempPageDir;
			tempPageDir = tempPageDir.replace(/[^\/]+\/\.\.\//, "");
		}
		while( tempPageDir !== pageDir );

		return pageDir;

	}

	_.each( _.keys( pagesMap ), function( pageName ) {

		var pageMetadata = pagesMap[ pageName ];

		var expandedDependencies = [];

		console.log( "BEFORE EXPANSION: " );
		console.log( pageMetadata.requiredBundles );

		pageMetadata.requiredBundles = _.filter( pageMetadata.requiredBundles, function( dependency ) {
			if( dependency.indexOf( "*") != -1 ) {
				expandedDependencies = _.union( expandedDependencies, expandDependencyWithWildcard( dependency, _.keys( bundleMap ) ) );
				return false;
			}
			else {
				return true;
			}
		} );

		pageMetadata.requiredBundles = _.union( pageMetadata.requiredBundles, expandedDependencies );

		console.log( "AFTER EXPANSION: " );
		console.log( pageMetadata.requiredBundles );
	} );


	var foundPageThatExtends = false;

	do {

		foundPageThatExtends = false;

		_.each( _.values( pagesMap ), function( page ) {

			if( ! _.isNull( page.extendsPage ) ) {

				var extendsPageName = resolveFullPageName( page.name, page.extendsPage );

				var extendsPage = pagesMap[ extendsPageName ];

				if( ! _.isNull( extendsPage.extendsPage ) ) {
					foundPageThatExtends = true;
					return;
				}

				page.files = _.union( page.files, extendsPage.files );
				page.requiredBundles = _.union( page.requiredBundles, extendsPage.requiredBundles );

				page.extendsPage = null;
			}

		} );


	} while( foundPageThatExtends );

	_.each( _.values( pagesMap ), function( page ) {

		page.files = _.map( page.files, function( file ) {
			return "{APP_PAGES}/" + file;
		} );

	} );

	console.log( "DONE: " );

	console.log( pagesMap );

}

exports.resolvePagesMap = function( pagesMap, bundleMap ) {
	resolvePagesMap( pagesMap, bundleMap );
};

function buildSubdirectoryRegExp( regexString ) {
	//trim the starting and ending '/'. TODO: support modifiers after the last slash
	return new RegExp( regexString.substring( 1, regexString.length - 1 ) );
}

function mapAssetFileName( fileName ) {

	if( _s.endsWith( fileName, ".scss" ) ||
		_s.endsWith( fileName, ".less" ) ||
		_s.endsWith( fileName, ".styl" )  ) {
		return fileName.substring( 0, fileName.length - 5 ) + ".css";
	}
	else if( _s.endsWith( fileName, ".coffee" ) ) {
		return fileName.substring( 0, fileName.length - 7 ) + ".js";
	}
	else {
		return fileName;
	}
}

exports.mapAssetFileName = function( fileName ) {
	return mapAssetFileName( fileName );
};

function buildBundlesMap( directory, rootDir, options ) {

	var fileDependencies = [];
	var bundleDependencies = [];

	//TODO: make global/configurable
	var subdirectoriesRegExpString = defaultSubdirectoriesRegExpString;

	var keepSeparate = false;
	var filePriority = [];

	var walker = new Walker( directory );

	var files = walker.ls();

	var bundleName = directory.substring( rootDir.length + 1 );

	if( _.contains( _.keys( files ), kBundleFileName ) ) {
		var bundleFileContents = walker.cat( kBundleFileName );
		var bundleJSON;

		try {
			bundleJSON = JSON.parse( bundleFileContents.toString() );
		}
		catch( e ) {
			throw new Error( "Failed to parse contents of bundle.json file in " + bundleName );
		}

		//var name = bundleJSON[ "name" ];
		var deps = bundleJSON[ "dependencies" ];
		var keepSep = bundleJSON[ "keepSeparate" ];
		var subdir = bundleJSON[ "subdirectories" ];
		var filePri = bundleJSON[ "filePriority" ];

		if( ! _.isUndefined( subdir ) ) {
			subdirectoriesRegExpString = subdir;
		}

		if( ! _.isUndefined( deps ) ) {
			bundleDependencies = _.union( bundleDependencies, deps );
		}

		if( ! _.isUndefined( keepSep ) ) {
			keepSeparate = keepSep;
		}

		if( ! _.isUndefined( filePri ) ) {
			filePriority = _.map( filePri, function( fileName ) {
				return walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1 );
			} );
		}

	}

	var dirRegExp = buildSubdirectoryRegExp( subdirectoriesRegExpString );

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( /*_s.startsWith( fileName, "_" )*/ dirRegExp.test( fileName ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), exports.isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( assetFile.substring( rootDir.length ) );
				} ) );
			}
			else {
				buildBundlesMap( walker.fullPath( fileName ), rootDir, options );
			}
		}
		else if( fileStats.isFile() ) {
			if( exports.isAssetFile( fileName ) ) {
				fileDependencies.push( walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1 ) );
			}
		}
	} );

	//if useDirectoriesForDependencies is true, add the parent directory to the dependencies (as long as we are not already at the root )
	if( options.useDirectoriesForDependencies && directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleDependencies.push( directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) );
	}

	//if priority files are specified, push them to the beginning
	if( filePriority.length > 0 ) {
		fileDependencies = _.union( filePriority, _.difference( fileDependencies, filePriority ) );
	}

	bundleMetadata[ bundleName ] = {
		name : bundleName,
		files : fileDependencies,
		subdirectories : subdirectoriesRegExpString,
		dependencies : bundleDependencies,
		keepSeparate : keepSeparate
	};

	return bundleMetadata;
}

exports.buildBundlesMap = function( dir, options ) {
	return buildBundlesMap( dir, dir, options );
};

function expandDependencyWithWildcard( bundlePattern, bundles ) {
	bundlePattern = bundlePattern.replace("*","[^\\/]*");
	bundlePattern += "$";
	var regExp = new RegExp(bundlePattern);
	var matchingBundles = _.filter( bundles, function( bundleName ) {
		return ! _.isNull( regExp.exec( bundleName ) );
	} );
	return matchingBundles;
}

function resolveBundlesMap( bundleMap, mode ) {

	function buildKeepSeparateBundleFileNames( bundle ) {

		if( bundle.dependencies.length === 0 && bundle.keepSeparate ) {

			var suffixes = _.map( bundle.files, function( file ) {
				return file.substring( file.lastIndexOf( "." ) );
			} );

			suffixes = _.uniq( suffixes );
			var thisBundleFiles = _.map( suffixes, function( suffix ) {

				return bundle.name.replace( /\//g, "_" ) + "_combined" + suffix;
			} );

			bundle.keepSeparateBundleFiles = _.union( bundle.keepSeparateBundleFiles, thisBundleFiles );
		}

	}

	var counter = 0;

	var foundBundleWithDeps = false;
	var resolvedABundle = false;

	//iterate through bundles and apply defaults/create any necessary properties
	_.each( _.values( bundleMap ), function( bundle ) {

		if( mode === "dev" ) bundle.keepSeparate = false;

		bundle.keepSeparateBundleFiles = [];

		if( _.isUndefined( bundle.dependencies ) ) bundle.dependencies = [];
		if( _.isUndefined( bundle.keepSeparate) ) bundle.keepSeparate = false;

		if( mode === "prod" ) {
			buildKeepSeparateBundleFileNames( bundle );
		}

		var expandedDependencies = [];

		bundle.dependencies = _.filter( bundle.dependencies, function( dependency ) {
			if( dependency.indexOf( "*") != -1 ) {
				expandedDependencies = _.union( expandedDependencies, expandDependencyWithWildcard( dependency, _.keys( bundleMap ) ) );
				return false;
			}
			else {
				return true;
			}
		} );

		bundle.dependencies = _.union( bundle.dependencies, expandedDependencies );

	} );

	do {

		foundBundleWithDeps = false;
		resolvedABundle = false;

		_.each( _.values( bundleMap ), function( bundle ) {

			var bundlesResolved = [];
			_.each( bundle.dependencies, function( dep ) {

				var depBundle = bundleMap[ dep ];

				if( _.isUndefined( depBundle ) ) {
					var errMsg = "ERROR:  Could not find metadata for bundle " + dep;
					throw new Error( errMsg );
				}

				//if the dependent bundle has had its dependencies resolved, we can use it
				if( depBundle.dependencies.length === 0 ) {

					//if this dependent bundle is supposed to be kept separate,
					//add the bundle name to the list of bundleFiles
					if( depBundle.keepSeparate && mode === "prod" ) {
						//bundle.bundleFiles.push( dep );
						//bundle.keepSeparateBundleFiles = _.union( bundle.keepSeparateBundleFiles, depBundle.keepSeparateBundleFiles );
						bundle.keepSeparateBundleFiles = _.union( depBundle.keepSeparateBundleFiles, depBundle.keepSeparateBundleFiles );
					}
					//else add its files to the current bundle's file
					else {
						bundle.files = _.union( depBundle.files, bundle.files  );
					}

					//add the separate files too
					bundle.keepSeparateBundleFiles = _.union( bundle.keepSeparateBundleFiles, depBundle.keepSeparateBundleFiles );

					//keep track of dependent bundles we have resolved to remove from the dependencies list later
					bundlesResolved.push( dep );
					resolvedABundle = true;
				}
				else {
					foundBundleWithDeps = true;
				}

			} );

			//remove the bundles we just resolved from the list
			bundle.dependencies = _.difference( bundle.dependencies, bundlesResolved );

			if( mode === "prod" ) {
				buildKeepSeparateBundleFileNames( bundle );
			}

		} );

		counter++;

		if( foundBundleWithDeps && ! resolvedABundle ) {
			throw "ERROR: Detected circular dependency among the bundles.";
		}

	//loop until all dependencies have been resolved
	} while( foundBundleWithDeps && resolvedABundle );

	_.each( _.keys( bundleMap ), function( bundleName ) {

		var files = bundleMap[ bundleName ].files;

		//prepend the {ASSET_LIBRARY} token
		bundleMap[ bundleName ].files = _.map( files, function( fileName ) {
			return "{ASSET_LIBRARY}/" + fileName;
		} );

	} );

	return bundleMap;
}

exports.resolveBundlesMap = function( bundleMap, mode ) {
	return resolveBundlesMap( bundleMap, mode );
};

function Walker( startDirectory ) {
	this.pwd = startDirectory;
}

Walker.prototype.cd = function( newDir ) {
	if( newDir[0] === path.sep ) {
		this.pwd = newDir;
	}
	else {
		this.pwd += path.sep + newDir;
	}
};

Walker.prototype.cat = function( fileName ) {
	var fileContents = fs.readFileSync( this.fullPath( fileName ) );
	return fileContents;
};

Walker.prototype.fullPath = function( fileName ) {
	return this.pwd + path.sep + fileName;
};

Walker.prototype.ls = function() {

	var _this = this;

	var files = fs.readdirSync( _this.pwd );

	var allFileStats = {};

	_.each( files, function( fileName ) {

		allFileStats[ fileName ] = fs.statSync( _this.pwd + path.sep + fileName );
	} );

	return allFileStats;
};


function resolveAndInjectDeps( path, bundleMap, pageMap, assetBundlerConfig, rootDir, req, res) {

	//console.log( path );

	var pageMetadata = pageMap[ path ];

	var jsScriptEls = "";
	var cssLinkEls = "";
	var tmplContents = "";
	var files = [];

	_.each( pageMetadata.requiredBundles, function( bundleName ) {

		var bundle = bundleMap[ bundleName ];

		if( ! bundle.keepSeparate ) {
			_.each( bundle.files, function( fileName ) {
				//files.push( fileName.replace( "{ASSET_LIBRARY}/", "/AssetLibrary-assets" ) );
				files.push( fileName.replace( "{ASSET_LIBRARY}/", "/" + assetBundlerConfig.assetLibraryDest ) );
			} );
		}

		files = _.uniq( files );

		//console.log( files );

		_.each( bundle.keepSeparateBundleFiles, function( fileName ) {
			//files.push( "/AssetLibrary-assets/" + fileName );
			files.push( "/" + assetBundlerConfig.assetLibraryDest + fileName );
		} );

	} );

	_.each( pageMetadata.files, function( file ) {
		files.push( file.replace( "{APP_PAGES}", "/" + assetBundlerConfig.appPagesDest ) );
	} );

	_.each( files, function( fileName ) {
		if( _s.endsWith( fileName, ".js" ) )
			jsScriptEls += "<script type='text/javascript' src='" + fileName + "'></script>\n";
		else if( _s.endsWith( fileName, ".css" ) )
			cssLinkEls += "<link rel='stylesheet' href='" + fileName + "'></script>\n";
		else if( _s.endsWith( fileName, ".tmpl" ) )
			tmplContents += fs.readFileSync( rootDir + fileName) + "\n";

	} );

	//res.render( path, { js_files : jsScriptEls, css_files : cssLinkEls, tmpl_contents : tmplContents } );

	res.locals.js_files = jsScriptEls;
	res.locals.css_files = cssLinkEls;
	res.locals.tmpl_contents = tmplContents;

	//console.log( jsScriptEls + "\n" + cssLinkEls + "\n" + tmplContents);

}

exports.bundlerMiddleware = function( rootDir ) {

	var bundleMap = this.readBundleMap();
	var pageMap = this.readPageMap();
	var bundlerConfig = this.readBundlerConfig();

	return function( req, res, next ) {

		if( _s.endsWith( req.path, ".swig") )
			resolveAndInjectDeps( req.path.substring(1), bundleMap, pageMap, bundlerConfig, rootDir, req, res );

		next();
	};
};



function resolveAndInjectDependencies( pagePath, bundleMap, pageMap, assetBundlerConfig, rootDir, staticDir, mode ) {

	//console.log( pagePath );

	var pageMetadata = pageMap[ pagePath ];

	var jsScriptEls = "";
	var cssLinkEls = "";
	var tmplContents = "";
	var files = [];

	var relativeAssetLibraryDir = "/" + assetBundlerConfig.assetLibraryDest.replace( staticDir, "");
	var relativeAppPagesDir = "/" + assetBundlerConfig.appPagesDest.replace( staticDir, "");


	//console.log( "relativeAssetLibraryDir: " + relativeAssetLibraryDir );
	//console.log( "relativeAppPagesDir: " + relativeAppPagesDir );

	_.each( pageMetadata.requiredBundles, function( bundleName ) {

		var bundle = bundleMap[ bundleName ];

		if( _.isUndefined( bundle ) ) {
			throw new Error( "Bundle '" + bundleName + "' listed in '" + pagePath + "' does not exist." );
		}

		//in prod mode, the files would have been incorporated into the page_combined
		if( ! bundle.keepSeparate && mode === "dev" ) {
			_.each( bundle.files, function( fileName ) {
				//files.push( fileName.replace( "{ASSET_LIBRARY}/", "/AssetLibrary-assets" ) );
				//files.push( fileName.replace( "{ASSET_LIBRARY}/", "/" + rootDir + path.sep + assetBundlerConfig.assetLibraryDest ) );
				files.push( fileName.replace( "{ASSET_LIBRARY}/", relativeAssetLibraryDir ) );
			} );
		}

		files = _.uniq( files );

		//console.log( files );

		_.each( bundle.keepSeparateBundleFiles, function( fileName ) {
			//files.push( "/AssetLibrary-assets/" + fileName );
			//files.push( "/" + assetBundlerConfig.assetLibraryDest + fileName );
			files.push( relativeAssetLibraryDir + fileName );
		} );

	} );

	_.each( pageMetadata.files, function( file ) {
		//files.push( file.replace( "{APP_PAGES}", "/" + assetBundlerConfig.appPagesDest ) );
		files.push( file.replace( "{APP_PAGES}/", relativeAppPagesDir ) );
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

	//console.log( jsScriptEls + "\n" + cssLinkEls + "\n" + tmplContents);
	pageMetadata.bundler_js = jsScriptEls;
	pageMetadata.bundler_css = cssLinkEls;
	pageMetadata.bundler_tmpl = tmplContents;

	

};

exports.isAssetFile = ( function() {
	var validAssetSuffixes = [ ".js", ".css", ".tmpl", ".coffee", ".less", ".scss", ".styl" ];
	var isAssetFileRegExpStrign = _.map( validAssetSuffixes, function( suffix ) {
		return suffix + "$";
	} ).join( "|" );

	var isAssetFileRegExp = new RegExp( isAssetFileRegExpStrign );

	return function( fileName ) {
		var match = isAssetFileRegExp.exec( fileName );
		return ! _.isNull( match );
	};

} () );


exports.resolveAndInjectDependencies = function( bundleMap, pageMap, assetBundlerConfig, rootDir, staticDir, mode ) {

	_.each( _.keys( pageMap ), function( pageName ) {

		resolveAndInjectDependencies( pageName, bundleMap, pageMap, assetBundlerConfig, rootDir, staticDir, mode );

	} );

	//console.log( "processedPageMap:" );
	//console.log( pageMap );

	return pageMap;

};
