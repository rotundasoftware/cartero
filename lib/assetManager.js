var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	findit = require( "findit" );

var kBundleFileName = "bundle.json";

var defaultSubDirectoriesRegExpString = "/_.*/";

var bundleMetadata = {};
var pageMetadata = {};

var kPageSuffix = "swig";

var kAssetBundlerDir = __dirname + "/../assetBundler/";

var kBundleMapJSONFile = "bundleMap.json";
var kPageMapJSONFile = "pageMap.json";
var kBundlerConfigJSONFile = "config.json";

var kBundlerRequireDirective = "bundler_require";
var kBundlerExtendsDirective = "bundler_extends";
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

function isAssetFile( fileName ) {
	var validAssetSuffixes = [ ".js", ".css", ".scss", ".tmpl" ];
	var regExpString = _.map( validAssetSuffixes, function( suffix ) {
		return suffix + "$";
	} ).join( "|" );

	var regExp = new RegExp( regExpString );
	var match = regExp.exec( fileName );
	return ! _.isNull( match );
}

function buildPagesMap( directory, rootDir ) {
	var walker = new Walker( directory );

	var files = walker.ls();

	var fileDependencies = [];

	var pageFiles = _.filter( _.keys( files ), function( fileName ) {

		return _s.endsWith( fileName, kPageSuffix );

	} );

	_.each( _.keys( files ), function( fileName ) {

		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( _s.startsWith( fileName, "_" ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( assetFile.substring( rootDir.length ) );
				} ) );
			}
			else {
				buildPagesMap( walker.fullPath( fileName ), rootDir );
			}
		}
		else if( fileStats.isFile() ) {

			//ignore templates
			if( _s.endsWith( fileName, kPageSuffix) ) return;

			if( isAssetFile( fileName ) ) fileDependencies.push( walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1) );

		}
	} );

	_.each( pageFiles, function( fileName ) {
		var pageFileContents = fs.readFileSync( walker.fullPath( fileName ) ).toString();
		var pageName = walker.fullPath( fileName ).substring( rootDir.length + 1 );

		var requiredBundles = [];
		var extendsPage = null;

		var bundlerRequireMatches = bundlerRequireRegExp.exec( pageFileContents );

		if( !_.isNull( bundlerRequireMatches ) ) {
			requiredBundles = JSON.parse( bundlerRequireMatches[1] );
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

exports.buildPagesMap = function( dir ) {
	return buildPagesMap( dir, dir );
};

function resolvePagesMap( pagesMap ) {

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

}

exports.resolvePagesMap = function( pagesMap ) {
	resolvePagesMap( pagesMap );
};

function buildSubDirectoryRegExp( regexString ) {
	//trim the starting and ending '/'. TODO: support modifiers after the last slash
	return new RegExp( regexString.substring( 1, regexString.length - 1 ) );
}

function mapAssetFileName( fileName ) {

	if( _s.endsWith( fileName, ".scss" ) ) {
		return fileName.substring(0, ".scss".length ) + ".css";
	}
	else {
		return fileName;
	}
}

function buildBundlesMap( directory, rootDir ) {

	var fileDependencies = [];
	var bundleDependencies = [];

	//TODO: make global/configurable
	var subDirectoriesRegExpString = defaultSubDirectoriesRegExpString;

	var keepSeparate = false;

	var walker = new Walker( directory );

	var files = walker.ls();

	var bundleName = directory.substring( rootDir.length + 1 );

	if( _.contains( _.keys( files ), kBundleFileName ) ) {
		var bundleFileContents = walker.cat( kBundleFileName );
		var bundleJSON = JSON.parse( bundleFileContents.toString() );

		//var name = bundleJSON[ "name" ];
		var deps = bundleJSON[ "dependencies" ];
		var keepSep = bundleJSON[ "keepSeparate" ];
		var subDir = bundleJSON[ "subDirectories" ];

		if( ! _.isUndefined( subDir ) ) {
			subDirectoriesRegExpString = subDir;
		}

		if( ! _.isUndefined( deps ) ) {
			bundleDependencies = _.union( bundleDependencies, deps );
		}

		if( ! _.isUndefined( keepSep ) ) {
			keepSeparate = keepSep;
		}

	}

	var dirRegExp = buildSubDirectoryRegExp( subDirectoriesRegExpString );

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( /*_s.startsWith( fileName, "_" )*/ dirRegExp.test( fileName ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), isAssetFile );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return mapAssetFileName( assetFile.substring( rootDir.length ) );
				} ) );
			}
			else {
				buildBundlesMap( walker.fullPath( fileName ), rootDir );
			}
		}
		else if( fileStats.isFile() ) {
			if( isAssetFile( fileName ) ) {
				fileDependencies.push( walker.fullPath( mapAssetFileName( fileName ) ).substring( rootDir.length + 1 ) );
			}
		}
	} );

	if( directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleDependencies.push( directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) );
	}

	bundleMetadata[ bundleName ] = {
		name : bundleName,
		files : fileDependencies,
		subDirectories : subDirectoriesRegExpString,
		dependencies : bundleDependencies,
		keepSeparate : keepSeparate
	};

	return bundleMetadata;
}

exports.buildBundlesMap = function( dir ) {
	return buildBundlesMap( dir, dir );
};

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

	} );

	do {

		foundBundleWithDeps = false;
		resolvedABundle = false;

		_.each( _.values( bundleMap ), function( bundle ) {

			var bundlesResolved = [];
			_.each( bundle.dependencies, function( dep ) {

				var depBundle = bundleMap[ dep ];

				//if the dependent bundle has had its dependencies resolved, we can use it
				if( depBundle.dependencies.length === 0 ) {

					//if this dependent bundle is supposed to be kept separate,
					//add the bundle name to the list of bundleFiles
					if( depBundle.keepSeparate && mode === "prod" ) {
						//bundle.bundleFiles.push( dep );
						bundle.keepSeparateBundleFiles = _.union( bundle.keepSeparateBundleFiles, depBundle.keepSeparateBundleFiles );
					}
					//else add its files to the current bundle's file
					else {
						bundle.files = _.union( bundle.files, depBundle.files );
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

		//reverse the order of the files...the goal is to list the files at the bottom of the dependency tree first

		var files = bundleMap[ bundleName ].files;

		files.reverse();

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

	console.log( path );

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

		console.log( files );

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

		//console.log( req );

		//console.log( req.path );

		if( _s.endsWith( req.path, ".swig") )
			resolveAndInjectDeps( req.path.substring(1), bundleMap, pageMap, bundlerConfig, rootDir, req, res );

		next();
	};
	//console.log( arguments.length );
	//console.log( "in myMethod" );

	//next();
};

/************OLDER VERSIONS OF SIMILAR METHODS****************/
/*

function getDependenciesForBundle( requirement ) {

	//TODO: support * as just a wildcard character
	var isRecursive = _s.endsWith( requirement, "/*" );

	if( isRecursive ) {
		requirement = requirement.substring(0, requirement.length - 2);
	}

	console.log(" computing requirement " + requirement);

	if( ! _.isUndefined( dependentFilesCache[ requirement ] ) ) {
		return dependentFilesCache[ requirement ];
	}

	var dependentFiles = [];

	var files = fs.readdirSync( rootDir + path.sep + requirement );

	if( _.contains( files, kBundleFileName ) ) {
		var bundleFile = rootDir + path.sep + requirement + path.sep + kBundleFileName;
		var bundleFileContents = fs.readFileSync( bundleFile );
		var bundleJSON = JSON.parse( bundleFileContents.toString() );

		if( _.isUndefined( bundleJSON.dependencies ) ) {
			_.each( bundleJSON.dependencies, function( dep ) {
				dependentFiles = _.union( dependentFiles, getDependenciesForBundle( dep ) );
			} );
		}
	}

	_.each( files, function ( fileName ) {

		if( _.contains( filesToIgnore, fileName ) || fileName[0] === "." ) return;

		var fullPath = rootDir + path.sep +	requirement + path.sep + fileName;
		var fileStats = fs.statSync( fullPath );

		if( fileStats.isFile() ) {
			dependentFiles.push( requirement + path.sep + fileName );
		}
		else if( fileStats.isDirectory() ) {
			// ignore directories that start with double underscore
			if( _s.startsWith( fileName , "__" ) ) return;

			// treat directories that start with one underscore as if they are part of the this bundle
			if( _s.startsWith( fileName, "_" ) || isRecursive )
				dependentFiles = _.union( dependentFiles, getDependenciesForBundle( requirement + path.sep + fileName ) );
		}

	} );

	// if we are not in a 'top level' directory and not a directory that starts with an underscore,
	// this dir depends on its parent
	if( requirement.indexOf( "/" ) != -1 && ! /\/_\w+$/.test( requirement ) ) {
		var parentDir = requirement.replace(/\/\w+$/, "");
		dependentFiles = _.union( dependentFiles, getDependenciesForBundle( parentDir ) );
	}

	dependentFilesCache[ requirement ] = dependentFiles;

	return dependentFiles;
}

exports.getDependenciesForBundle = function( bundles ) {

	var outputList = [];
	_.each( bundles, function( bundle)  {
		outputList = _.union( outputList, getDependenciesForBundle( bundle ) );
	} );

	return _.uniq( outputList );
};

var templateToDependencyMap = {};


var rootAppPagesPath = "WebServer/AppPages";

function getDependenciesForTemplate( templatePath, bundleMap ) {

	function isAssetFile( fileName ) {
		var validAssetSuffixes = [ ".js", ".css", ".scss", ".tmpl" ];

		var regExpString = _.map( validAssetSuffixes, function( suffix ) {
			return suffix + "$";
		} ).join( "|" );

		var regExp = new RegExp( regExpString );

		var match = regExp.exec( fileName );

		return ! _.isNull( match );
	}

	if( ! _.isUndefined( templateToDependencyMap[templatePath] ) )
		return templateToDependencyMap[templatePath];

	var directory = templatePath.replace(/\/[^\/]+$/, "");

	var dependentFiles = [];

	var files = fs.readdirSync( rootAppPagesPath + path.sep + directory );

	_.each( files, function( fileName ) {

		var fullPath = rootAppPagesPath + path.sep + directory + path.sep + fileName;
		var fileStats = fs.statSync( fullPath );

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) return;
			if( _s.startsWith( fileName, "_") ) {
				var assetFiles = _.filter( findit.sync( fullPath ), isAssetFile );
				dependentFiles = _.union( dependentFiles, assetFiles );
			}
		}
		else if( fileStats.isFile() ) {
			if( isAssetFile( fileName ) ) dependentFiles.push( rootAppPagesPath + path.sep + directory + path.sep + fileName );
		}

	} );

	var templateFileContents = fs.readFileSync( rootAppPagesPath + path.sep + templatePath ).toString();
	var bundlerRequireMatches = bundlerRequireRegExp.exec( templateFileContents );

	if( ! _.isNull( bundlerRequireMatches ) ) {
		var requiredBundles = JSON.parse( bundlerRequireMatches[1] );
		//append the required bundles
		//TODO: resolve bundles to file names

		_.each( requiredBundles, function( bundleName ) {
			var bundle = bundleMap[ bundleName ];

			if( ! bundle.keepSeparate )
				dependentFiles = _.union( dependentFiles, bundle.files );

			dependentFiles = _.union( dependentFiles, bundle.bundleFiles );
			//dependentFiles = _.union( dependentFiles, getDependenciesForBundle( bundle ) );
		} );
		//dependentFiles = _.union( dependentFiles, requiredBundles );
	}

	var bundlerExtendsMatches = bundlerExtendsRegExp.exec( templateFileContents );

	if( ! _.isNull( bundlerExtendsMatches ) ) {
		var extendsTemplate = bundlerExtendsMatches[1];
		dependentFiles = _.union( dependentFiles, getDependenciesForTemplate( directory + path.sep + extendsTemplate, bundleMap ) );
	}
	else {
		console.log( "bundler extends did not match ");
	}

	templateToDependencyMap[ templatePath ] = dependentFiles;

	return templateToDependencyMap[ templatePath ];
}

exports.getDependenciesForTemplate = function( templatePath, bundleMap ) {
	return getDependenciesForTemplate( templatePath, bundleMap );
};



function buildTemplateToDependencyMapping( ) {

	var rootDir = "AppPages";

	var templateSuffix = "twig";

	function processDirectory( dir ) {

		console.log( "processing " + dir );
		var files = fs.readdirSync( dir );
		var templateFiles = _.filter( files, function( fileName ) {

			return _s.endsWith( fileName, templateSuffix );

		} );

		var dependentFiles = [];

		_.each( files, function( fileName ) {

			//ignore this file if its one of the template files
			if( _.contains( templateFiles, fileName ) || fileName[0] === "." ) return;

			var fullPath = dir + path.sep + fileName;
			var fileStats = fs.statSync( fullPath );

			if( fileStats.isFile() ) {

				if( isAssetFile( fileName ) ) {
					dependentFiles.push( fullPath );
				}

			}
			else if( fileStats.isDirectory() ) {

				if( _s.startsWith( fileName, "__" ) ) return;
				if( _s.startsWith( fileName, "_") ) {
					var assetFiles = _.filter( findit.sync( fullPath ), isAssetFile );
					dependentFiles = _.union( dependentFiles, assetFiles );
				}
				else {
					processDirectory( fullPath );
				}

			}
		} );

		_.each( templateFiles, function( templateFile ) {

			var templateFileContents = fs.readFileSync( dir + path.sep + templateFile ).toString();
			var bundlerRequireMatches = bundlerRequireRegExp.exec( templateFileContents );

			templateToDependencyMap[ dir + path.sep + templateFile ] = dependentFiles;

			if( ! _.isNull( bundlerRequireMatches ) ) {
				var requiredBundles = JSON.parse( bundlerRequireMatches[1] );
				//append the required bundles
				//TODO: resolve bundles to file names
				templateToDependencyMap[ dir + path.sep + templateFile ] = _.union( templateToDependencyMap[ dir + path.sep + templateFile ], requiredBundles );
			}
		} );
	}

	processDirectory( "AppPages" );

	return templateToDependencyMap;

}

exports.buildTemplateToDependencyMapping = function() {
	return buildTemplateToDependencyMapping();
};
*/
 
