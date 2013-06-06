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

function buildPagesMap( directory, rootDir, options, dirOptions ) {

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

			if( dirOptions.directoriesToFlatten.test( fileName ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), exports.isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( path.join( dirOptions.destDir, assetFile.substring( rootDir.length ) ), options.assetExtensionMap );
				} ) );
			}
			else {
				buildPagesMap( walker.fullPath( fileName ), rootDir, options, dirOptions );
			}
		}
		else if( fileStats.isFile() ) {

			if( dirOptions.filesToIgnore.test( fileName ) ) return;

			if( exports.isAssetFile( fileName ) ) fileDependencies.push( path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName, options.assetExtensionMap ) ).substring( rootDir.length + 1) ) );

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
		_.extend( pageMap, buildPagesMap( dirOptions.path, dirOptions.path, options, dirOptions ) );
	} );

	return pageMap;
};

function buildRegExpFromString( regexString ) {
	return new RegExp( regexString.substring( 1, regexString.lastIndexOf( "/" ) ), regexString.substring( regexString.lastIndexOf( "/" ) + 1 ) );
}

function mapAssetFileName( fileName, assetExtensionMap ) {

	var fileExt = fileName.substring( fileName.lastIndexOf( "." ) );

	var outExt = assetExtensionMap[ fileExt ];

	if( ! _.isUndefined( outExt ) )
		return fileName.substring( 0, fileName.lastIndexOf( "." ) ) + outExt;
	else
		return fileName;
}

exports.mapAssetFileName = function( fileName, assetExtensionMap ) {
	return mapAssetFileName( fileName, assetExtensionMap );
};

function buildBundlesMap( directory, rootDir, options, dirOptions ) {

	var fileDependencies = [];
	var bundleDependencies = [];


	var directoriesToFlattenRegExp = dirOptions.directoriesToFlatten;
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

	var namespacePrefix = dirOptions.namespace ? dirOptions.namespace + "/" : "";
	var bundleName = namespacePrefix + directory.substring( rootDir.length + 1 );
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
		var dirToFlatten = bundleJSON[ "directoriesToFlatten" ];
		var filePri = bundleJSON[ "filePriority" ];
		var ignoreFiles = bundleJSON[ "filesToIgnore" ];

		if( ! _.isUndefined( dirToFlatten ) ) {
			directoriesToFlattenRegExp = buildRegExpFromString( dirToFlatten );
		}

		if( ! _.isUndefined( deps ) ) {
			bundleDependencies = _.union( bundleDependencies, deps );
		}

		if( ! _.isUndefined( keepSep ) ) {
			keepSeparate = keepSep;
		}

		if( ! _.isUndefined( filePri ) ) {
			filePriority = _.map( filePri, function( fileName ) {
				return path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName, options.assetExtensionMap ) ).substring( rootDir.length + 1 ) );
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

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( directoriesToFlattenRegExp.test( fileName ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), exports.isAssetFile );
				var subdirectoryFiles = _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( path.join( dirOptions.destDir, path.join( assetFile.substring( rootDir.length ) ) ), options.assetExtensionMap );
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

				var resolvedFileName = path.join( dirOptions.destDir, walker.fullPath( mapAssetFileName( fileName, options.assetExtensionMap ) ).substring( rootDir.length + 1 ) );

				//if prioritizeSubdirectories is true, append the file at the end.
				//otherwise append it at the beginning
				if( prioritizeSubdirectories )
					fileDependencies.push( resolvedFileName );
				else
					fileDependencies.unshift( resolvedFileName );
			}
		}
	} );

	// if childrenDependOnParents is true, add the parent directory to the dependencies (as long as we are not already at the root )
	if( dirOptions.childrenDependOnParents && directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleDependencies.push( namespacePrefix + directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) );
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
		directoriesToFlatten : directoriesToFlattenRegExp.toString(),
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
