var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	findit = require( "findit" );

var kBundleFileName = "bundle.json";

var defaultSubdirectoriesRegExpString = "/_.*/";

var bundleMetadata = {};
var pageMetadata = {};

var kAssetBundlerDir = __dirname + "/../output/";

var kBundleMapJSONFile = "bundleMap.json";
var kPageMapJSONFile = "pageMap.json";
var kBundlerConfigJSONFile = "config.json";

var kBundlerRequireDirective = "#bundler_require";
var kBundlerExtendsDirective = "#bundler_extends";
var bundlerRequireRegExp = new RegExp( kBundlerRequireDirective + " (.*?)(-->)?\n" );
var bundlerExtendsRegExp = new RegExp( kBundlerExtendsDirective + " \"(.*?)\"\\s*?(-->)?\n" );

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

function buildPagesMap( directory, rootDir, dirOptions ) {

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

	var walker = new Walker( directory );

	var files = walker.ls();

	var fileDependencies = [];

	var pageFiles = _.filter( _.keys( files ), function( fileName ) {
		return dirOptions.pageFileRegExp.test( fileName );

	} );

	_.each( _.keys( files ), function( fileName ) {

		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {

			if( dirOptions.directoriesToIgnore.test( fileName ) ) return;

			if( _s.startsWith( fileName, "_" ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), exports.isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( path.join( dirOptions.destDir, assetFile.substring( rootDir.length ) ) );
				} ) );
			}
			else {
				buildPagesMap( walker.fullPath( fileName ), rootDir, dirOptions );
			}
		}
		else if( fileStats.isFile() ) {

			if( dirOptions.filesToIgnore.test( fileName ) ) return;

			if( exports.isAssetFile( fileName ) ) fileDependencies.push( path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1) ) );

		}
	} );

	_.each( pageFiles, function( fileName ) {
		var pageFileContents = fs.readFileSync( walker.fullPath( fileName ) ).toString();
		var pageName = path.join( dirOptions.path, walker.fullPath( fileName ).substring( rootDir.length + 1 ) );
		var pageFolder = path.join( dirOptions.destDir, walker.fullPath( fileName ).substring( rootDir.length + 1 ) ).replace( /\/[^\/]+$/, "" );

		var requiredBundles = [];
		var extendsPage = null;

		var bundlerRequireMatches = bundlerRequireRegExp.exec( pageFileContents );

		if( !_.isNull( bundlerRequireMatches ) ) {
			try {
				requiredBundles = JSON.parse( "[" + bundlerRequireMatches[1] + "]" );
			}
			catch( e ) {
				throw new Error ( "Error while parsing required bundles for " + pageName + ": " + e );
			}

		}

		var bundlerExtendsMatches = bundlerExtendsRegExp.exec( pageFileContents );

		if( !_.isNull( bundlerExtendsMatches ) ) {
			extendsPage = resolveFullPageName( pageName, bundlerExtendsMatches[1] );
		}

		pageMetadata[ pageName ] = {
			name : pageName,
			folder : pageFolder,
			files : fileDependencies,
			requiredBundles : requiredBundles,
			extendsPage : extendsPage
		};
	} );

	return pageMetadata;
}

exports.buildPagesMap = function( dirs, options ) {

	var pageMap = {};

	_.each( dirs, function ( dirOptions ) {
		_.extend( pageMap, buildPagesMap( dirOptions.path, dirOptions.path, dirOptions ) );
	} );

	return pageMap;
};

function resolvePagesMap( pagesMap, bundleMap ) {



	_.each( _.keys( pagesMap ), function( pageName ) {

		var pageMetadata = pagesMap[ pageName ];

		var expandedDependencies = [];

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

	} );


	var foundPageThatExtends = false;

	do {

		foundPageThatExtends = false;

		_.each( _.values( pagesMap ), function( page ) {

			if( ! _.isNull( page.extendsPage ) ) {

				//var extendsPageName = resolveFullPageName( page.name, page.extendsPage );

				var extendsPageName = page.extendsPage;

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

function buildBundlesMap( directory, rootDir, options, dirOptions ) {

	var fileDependencies = [];
	var bundleDependencies = [];

	//TODO: make global/configurable
	var subdirectoriesRegExpString = defaultSubdirectoriesRegExpString;

	var keepSeparate = false;
	var prioritizeSubdirectories = false;
	var filePriority = [];
	var filesToIgnore = [];
	var browserifyAutorun = [];
	var dynamicallyLoadedFiles = [];
	var devModeOnlyFiles = [];
	var prodModeOnlyFiles = [];

	var walker = new Walker( directory );

	var files = walker.ls();


	var bundleName = path.join( dirOptions.namespace, directory.substring( rootDir.length + 1 ) );
	var bundleDestFolder = path.join( dirOptions.destDir, directory.substring( rootDir.length + 1 ) );

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
		var ignoreFiles = bundleJSON[ "filesToIgnore" ];

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
				return path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1 ) );
			} );
		}

		if( ! _.isUndefined( ignoreFiles ) ) {
			filesToIgnore = _.map( ignoreFiles, function( ignoreFile ) {
				return path.join( bundleName, ignoreFile );
			} );
		}

		if( ! _.isUndefined( bundleJSON[ "prioritizeSubdirectories" ] ) )
			prioritizeSubdirectories = bundleJSON[ "prioritizeSubdirectories" ];

		if( ! _.isUndefined( bundleJSON[ "browserifyAutorun" ] ) )
			browserifyAutorun = _.map( bundleJSON[ "browserifyAutorun" ], function( autorunFiles ) {
				return path.join( bundleName, autorunFiles );
			} );

		if( ! _.isUndefined( bundleJSON[ "dynamicallyLoadedFiles" ] ) )
			dynamicallyLoadedFiles = _.map( bundleJSON[ "dynamicallyLoadedFiles" ], function( dynamicallyLoadedFile ) {
				return path.join( bundleName, dynamicallyLoadedFile );
			} );

		if( ! _.isUndefined( bundleJSON[ "prodModeOnlyFiles" ] ) )
			prodModeOnlyFiles = _.map( bundleJSON[ "prodModeOnlyFiles" ], function( fileName ) {
				return path.join( bundleName, fileName );
			} );

		if( ! _.isUndefined( bundleJSON[ "devModeOnlyFiles" ] ) )
			devModeOnlyFiles = _.map( bundleJSON[ "devModeOnlyFiles" ], function( fileName ) {
				return path.join( bundleName, fileName );
			} );

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
				var subdirectoryFiles = _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( path.join( dirOptions.destDir, path.join( assetFile.substring( rootDir.length ) ) ) );
				} );

				//if prioritizeSubdirectories is true, append the subdirectoryFiles at the beginning.
				//otherwise append them at the end
				if( prioritizeSubdirectories ) {
					fileDependencies = _.union( subdirectoryFiles, fileDependencies );
				}
				else
					fileDependencies = _.union( fileDependencies, subdirectoryFiles );

			}
			else {
				buildBundlesMap( walker.fullPath( fileName ), rootDir, options, dirOptions);
			}
		}
		else if( fileStats.isFile() ) {
			if( exports.isAssetFile( fileName ) ) {

				var resolvedFileName = path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1 ) );

				//if prioritizeSubdirectories is true, append the file at the end.
				//otherwise append it at the beginning
				if( prioritizeSubdirectories )
					fileDependencies.push( resolvedFileName );
				else
					fileDependencies.unshift( resolvedFileName );
			}
		}
	} );

	// if useDirectoriesForDependencies is true, add the parent directory to the dependencies (as long as we are not already at the root )
	if( options.useDirectoriesForDependencies && directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleDependencies.push( path.join( dirOptions.namespace, directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) ) );
	}

	// add "_" files/directories after other top level files
	//fileDependencies = _.sortBy( fileDependencies, function( fileName ) {
	//	if( _s.startsWith( fileName.replace( bundleName + path.sep, "" ) , "_" ) )
	//		return 1;
	//	else
	//		return 0;
	//} );

	// if priority files are specified, push them to the beginning
	if( filePriority.length > 0 ) {

		var invalidFilesInFilePriority = _.difference( filePriority, fileDependencies );

		if( invalidFilesInFilePriority.length > 0 )
			throw new Error( "The following files listed in the filePriority in the bundle.json of " + bundleName + " do not exist: " + invalidFilesInFilePriority.join( ",") );

		fileDependencies = _.union( filePriority, _.difference( fileDependencies, filePriority ) );

	}

	//remove dynamically loaded files from the file dependencies list
	if( dynamicallyLoadedFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, dynamicallyLoadedFiles );

	if( options.mode === "dev" && prodModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, prodModeOnlyFiles );
	else if( options.mode === "prod" && devModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, devModeOnlyFiles );

	// remove files that we want to ignore
	if( filesToIgnore.length > 0 )
		fileDependencies = _.difference( fileDependencies, filesToIgnore );

	bundleMetadata[ bundleName ] = {
		name : bundleName,
		folder : bundleDestFolder,
		files : fileDependencies,
		subdirectories : subdirectoriesRegExpString,
		dependencies : bundleDependencies,
		keepSeparate : keepSeparate,
		browserifyAutorun : browserifyAutorun,
		dynamicallyLoadedFiles : dynamicallyLoadedFiles
	};

	return bundleMetadata;
}

exports.buildBundlesMap = function( dirs, options ) {
	var bundlesMap = {};
	_.each( dirs, function( dirOptions ) {
		_.extend(bundlesMap, buildBundlesMap( dirOptions.path, dirOptions.path, options, dirOptions ) );
	} );
	return bundlesMap;
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

exports.expandDependencyWithWildcard = function( bundlePattern, bundles ) {
	return expandDependencyWithWildcard( bundlePattern, bundles );
}

function getLocalFileName( filePath ) {
	return filePath.replace( /^.*\/([^\/]+)$/g, "$1" ) 
}

exports.getLocalFileName = function( filePath ) {
	return getLocalFileName( filePath );
};

function resolveBundlesMap( bundleMap, mode ) {

	function buildKeepSeparateBundleFileNames( bundle ) {

		if( bundle.dependencies.length === 0 && bundle.keepSeparate ) {

			var suffixes = _.map( bundle.files, function( file ) {
				return file.substring( file.lastIndexOf( "." ) );
			} );

			suffixes = _.uniq( suffixes );
			var thisBundleFiles = _.map( suffixes, function( suffix ) {

				//return bundle.name.replace( /\//g, "_" ) + "_combined" + suffix;
				return bundle.name + path.sep + getLocalFileName( bundle.name ) + "_combined" + suffix;
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

					//add the dynamically loaded files too
					bundle.dynamicallyLoadedFiles = _.union( bundle.dynamicallyLoadedFiles, depBundle.dynamicallyLoadedFiles );

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

		var dynamicallyLoadedFiles = bundleMap[ bundleName ].dynamicallyLoadedFiles;
		bundleMap[ bundleName ].dynamicallyLoadedFiles = _.map( dynamicallyLoadedFiles, function( fileName ) {
			return "{ASSET_LIBRARY}/" + fileName;
		} );

		var keepSeparateBundleFiles = bundleMap[ bundleName ].keepSeparateBundleFiles;
		bundleMap[ bundleName ].keepSeparateBundleFiles = _.map( keepSeparateBundleFiles, function( fileName ) {
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

function resolveAndInjectDependencies( pagePath, bundleMap, pageMap, configOptions, mode ) {

	var pageMetadata = pageMap[ pagePath ];

	var jsScriptEls = "";
	var cssLinkEls = "";
	var tmplContents = "";
	var files = [];

	//var relativeAssetLibraryDir = configOptions.assetLibrary.destDir.replace( configOptions.staticDir, "");
	//var relativeAppPagesDir = configOptions.appPages.destDir.replace( configOptions.staticDir, "");

	_.each( pageMetadata.requiredBundles, function( bundleName ) {

		var bundle = bundleMap[ bundleName ];

		if( _.isUndefined( bundle ) ) {
			throw new Error( "Bundle '" + bundleName + "' listed in '" + pagePath + "' does not exist." );
		}

		//in prod mode, the files would have been incorporated into the page_combined
		if( ! bundle.keepSeparate && mode === "dev" ) {
			_.each( bundle.files, function( fileName ) {
				files.push( fileName/*.replace( "{ASSET_LIBRARY}/", relativeAssetLibraryDir )*/ );
			} );
		}

		_.each( bundle.keepSeparateBundleFiles, function( fileName ) {
			files.push( fileName/*.replace( "{ASSET_LIBRARY}/", relativeAssetLibraryDir )*/ );
		} );
	} );

	_.each( pageMetadata.files, function( file ) {
		files.push( file/*.replace( "{APP_PAGES}/", relativeAppPagesDir )*/ );
	} );

	files = _.uniq( files );

	var tmplFiles = [];

	modeFiles = pageMetadata[ mode ] = {};

	_.each( files, function( fileName ) {

		var suffix = fileName.substring( fileName.lastIndexOf( "." ) + 1 );

		if( _.isUndefined( modeFiles[ suffix ] ) )
			modeFiles[ suffix ] = [];

		modeFiles[ suffix ].push( fileName );

	} );
}

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


exports.resolveAndInjectDependencies = function( bundleMap, pageMap, assetBundlerConfig, mode ) {
	_.each( _.keys( pageMap ), function( pageName ) {
		resolveAndInjectDependencies( pageName, bundleMap, pageMap, assetBundlerConfig, mode );
	} );
};
