/*
 * grunt-asset-bundler
 * https://github.com/go-oleg/bundler
 *
 * Copyright (c) 2013 Oleg Seletsky
 * Licensed under the MIT license.
 */

var assetBundlerUtil = require( "./../lib/util.js" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	fs = require( "fs" ),
	findit = require( "findit" ),
	path = require( "path" ),
	detective = require( "detective" ),
	resolve = require( "resolve" ),
	browserify = require( "browserify" ),
	async = require( "async" ),
	through = require( "through" ),
	cartero = require( "./../lib/cartero" );

'use strict';

module.exports = function(grunt) {

	// Prefix for all task targets added by assetBundler to avoid conflicts with already existing targets.
	var kCarteroTaskPrefix = "CARTERO";

	var kLibraryAssetsDirPrefix = "library-assets-";
	var kViewAssetsDirPrefix = "view-assets-";

	// cartero directive: When browserify is enabled, this directive is used in js files in appPages that should be automatically run upon loading.
	var kBrowserifyAutorun = "##cartero_browserify_autorun";

	// Default values for the views task option.
	var kViewsDirDefaults = {
		filesToIgnore : /^_.*/,
		foldersToIgnore : /^__.*/,
		viewFileExt : [ ".jade" ],
		directoriesToFlatten : /^_.*/
	};

	// Default values for the library task option.
	var kLibraryDirDefaults = {
		childrenDependOnParents : true,
		directoriesToFlatten : /^_.*/
	};

	// Global default values
	var kOptionsDefaults = {
		browserify : false,
		templateExt : [ ".jade" ]
	};

	var kValidImageExt = [ ".jpg", ".png", ".gif", ".bmp", ".jpeg" ];

	// Map specifying the supported preprocessing tasks, the file extension they process, and the file extension they output.
	var compileAssetsMap = {
		coffee : {
			inExt : ".coffee",
			outExt : ".js"
		},
		sass : {
			inExt : ".scss",
			outExt : ".css"
		},
		less : {
			inExt : ".less",
			outExt : ".css"
		},
		stylus : {
			inExt : ".styl",
			outExt : ".css"
		}
	};

	var kJSandCSSExt = [ ".css", ".js" ];

	// Will contain options passed into the assetBundler task with defaults applied.
	var options = {};

	// Will contain the mode the assetBundler is being run with: `dev` or `prod`.
	var mode;

	// Store bundleMap metadata here while we're working on it.  Written to kBundleMapJSONFile at the end.
	var bundleMap = {};

	// Store pageMap metadata here while we're working on it.  Written to kBundleMapJSONFile at the end.
	var pageMap = {};

	var bundles = {};
	var parcels = {};

	// Files that are browserified and need to be run upon loading.
	var browserifyAutorunFiles = [];

	// Convenience function that is used by the watch tasks when assetBundler metadata changes and the pageMap and bundleMap need to be rebuilt.
	function rebundle() {
		grunt.task.run( "buildBundleAndPageJSONs:" + mode );
		grunt.task.run( "buildJsCssTmplLists" );
		grunt.task.run( "saveCarteroJSON" );
	}

	// Processes a CSS file looking for url().  Replaces relative paths with absolute ones ( to the staticDir ).
	// TODO: make this stuff async.
	function replaceRelativeURLsInCSSFile( fileName, callback ) {
		fs.readFile( fileName, function( err, data ) {

			var fileContents = data.toString().replace( /url\(([^)]+)\)/g, function( match, url ) {
				// don't need to do anything with absolute urls
				if( url[0] === "/" ) return match;

				var absolutePath = fileName.replace(/\/[^\/]*$/,"/") + path.sep + url;

				if( fs.existsSync( absolutePath ) ) {
					var replacement = "url(" + fs.realpathSync( absolutePath ).replace( fs.realpathSync( options.publicDir ), "" ) + ")";
					return replacement;
				}
				else {
					return match;
				}

			} );

			fs.writeFile( fileName, fileContents, function( err ) {
				callback( err );
			} );
		} );
	}

	// returns true if the given fileName represents a server-side view
	function isViewFile( fileName ) {
		var viewFile = _.find( options.views, function( dirOptions ) {
			return _s.startsWith( fileName, dirOptions.path ) && _.contains( dirOptions.viewFileExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
		} );

		return ! _.isUndefined( viewFile );
	}

	// returns true if the given fileName is in a `views` directory
	function isViewsFile( fileName ) {

		var result = _.find( options.views, function( dirOptions ) {
			return _s.startsWith( fileName, dirOptions.path );
		} );

		return ! _.isUndefined( result );

	}

	function getExtension( fileName ) {
		return fileName.substring( fileName.lastIndexOf( "." ) );
	}

	grunt.registerMultiTask( "cartero", "Your task description goes here.", function() {

		// Grab the options and apply defaults
		options = this.options();

		if( ! _.isArray( options.library ) )
			options.library = [ options.library ];

		if( ! _.isArray( options.views ) )
			options.views = [ options.views ];

		// apply the defaults to all bundleDirs and add the destination directory
		options.library = _.map( options.library, function( bundleDir ) {
			var bundleDirWithDefaults = _.extend( {}, kLibraryDirDefaults, bundleDir );

			if( ! _.isUndefined( bundleDirWithDefaults.namespace ) )
				bundleDirWithDefaults.destDir = path.join( options.publicDir, kLibraryAssetsDirPrefix + bundleDirWithDefaults.namespace );
			else
				bundleDirWithDefaults.destDir = options.publicDir;
			return bundleDirWithDefaults;
		} );

		// apply the defaults to all viewDirs and add destination directory
		var viewAssetsDirCounter = 0;
		options.views = _.map( options.views, function( viewDir ) {
			var viewDirWithDefaults = _.extend( {}, kViewsDirDefaults, viewDir );
			viewDirWithDefaults.destDir = path.join( options.publicDir, kViewAssetsDirPrefix + viewAssetsDirCounter++ );
			if( _.isString( viewDirWithDefaults.viewFileExt ) ) viewDirWithDefaults.viewFileExt = [ viewDirWithDefaults.viewFileExt ];
			return viewDirWithDefaults;
		} );

		options.bundleAndViewDirs = _.union( options.library, options.views );

		options = _.extend(
			{},
			kOptionsDefaults,
			options
		);

		options.preprocessingTasks = _.map( options.preprocessingTasks, function( preprocessingTask ) {
			var defaults = compileAssetsMap[ preprocessingTask.name ] || {};
			var result = _.extend( {}, defaults, preprocessingTask );
			if( _.isUndefined( result.outExt ) )
				result.outExt = result.inExt;
			return result;
		} );

		options.assetExtensionMap = {};

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			options.assetExtensionMap[ preprocessingTask.inExt ] = preprocessingTask.outExt;
		} );

		options.cleanableAssetExt = _.union( options.templateExt, kJSandCSSExt );
		options.validOriginalAssetExt = _.union( _.keys( options.assetExtensionMap ), kJSandCSSExt, options.templateExt );
		options.extToCopy = _.union( options.templateExt, kValidImageExt, kJSandCSSExt );
		options.carteroDirExt = _.union( options.templateExt, kJSandCSSExt );

		mode = options.mode;

		var watch = grunt.config( "watch" ) || {};
		var carteroBrowserify = grunt.config( "carterobrowserify" ) || {};

		// For each supplied preprocessingTask, set up the task configuration:
		// - files : All files of the given inExt in all `views` and `library` directories
		// - options : Pass through options supplied in the processingTask
		_.each( options.preprocessingTasks, function( preprocessingTask ) {

			var taskName = preprocessingTask.name;

			var task = grunt.config( taskName ) || {};

			var files = [];

			_.each( options.bundleAndViewDirs, function( dir ) {
				files.push( {
					expand: true,
					cwd: dir.path,
					src: [ "**/*" + preprocessingTask.inExt ],
					dest: dir.destDir,
					ext: preprocessingTask.outExt
					} );
			} );

			task[ kCarteroTaskPrefix ] = {
				files : files
			};

			if( ! _.isUndefined( preprocessingTask.options ) ) {
				task[ kCarteroTaskPrefix ].options = preprocessingTask.options;
			}

			grunt.config( taskName, task );

			// Configure a watch target to watch files with an `inExt` extension
			// and run the preprocessing task.
			watch[ kCarteroTaskPrefix + "_" + taskName ] = {
				files : _.map( options.bundleAndViewDirs, function ( dir ) {
					return dir.path + "/**/*" + preprocessingTask.inExt;
				} ),
				tasks : [ taskName + ":" + kCarteroTaskPrefix ],
				options : {
					nospawn : true
				}
			};
		} );

		// For each supplied minificationTask, set up the task configuration
		_.each( options.minificationTasks, function( minificationTask ) {

			var task = grunt.config( minificationTask.name ) || {};

			var files = [];

			_.each( options.bundleAndViewDirs, function( dir ) {
				files.push( {
					expand: true,
					cwd: dir.destDir,
					src: [ "**/*" + minificationTask.inExt ],
					dest: dir.destDir,
					ext: minificationTask.outExt
				} );
			} );

			task[ kCarteroTaskPrefix ] = {
				files : files
			};

			if( !_.isUndefined( minificationTask.options ) )
				task[ kCarteroTaskPrefix ].options = minificationTask.options;

			grunt.config( minificationTask.name, task );

		} );

		// Loop through the assets that don't require preprocessing and create/configure the target
		_.each( options.extToCopy, function ( ext ) {

			var tasksToRun =  [];

			if( options.browserify && ext === ".js" )
				tasksToRun.push( "carterobrowserify:" + kCarteroTaskPrefix );

			if( _.contains( options.carteroDirExt, ext ) )
				tasksToRun.push( "replaceCarteroDirTokens" );

			watch[ kCarteroTaskPrefix + "_" + ext ] = {
				files : _.map( options.bundleAndViewDirs, function ( dir ) {
					return dir.path + "/**/*" + ext;
				} ),
				tasks : tasksToRun,
				options : {
					nospawn : true
				}
			};

		} );

		var viewFilePatterns = [];

		_.each( options.views, function( dirOptions ) {
			_.each( dirOptions.viewFileExt, function( ext ) {
				viewFilePatterns.push( dirOptions.path + "/**/*" + ext );
			} );
		} );

		// TODO: this should somehow be using options.appPages.pageFileRegExp
		watch[ kCarteroTaskPrefix + "_view_file" ] = {
			files : viewFilePatterns,
			tasks : [ "processViewFileChange" ],
			options : {
				nospawn : true
			}
		};

		// Watch changes to bundle.json files
		watch[ kCarteroTaskPrefix + "_bundle_json" ] = {
			files : _.map( options.views, function ( dir ) {
					return dir.path + "/**/*" + "**/bundle.json";
				} ),
			tasks : [ "processBundleJSONChange" ],
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );

		grunt.event.on( "watch", function( action, filepath ) {

			//if the file is new, rebuild all the bundle stuff (if its a pageFile or bundle.json file, this is already handled by the watch )
			if( ( action === "added" || action === "deleted" ) && ! isViewFile( filePath ) && ! _s.endsWith( filepath, "bundle.json" ) ) {
				rebundle();
			}

			var dirOptions = _.find( options.bundleAndViewDirs, function( dirOptions ) {
				return filepath.indexOf( dirOptions.path ) === 0;
			} );

			var newDest = filepath.replace( dirOptions.path, dirOptions.destDir );

			newDest = assetBundlerUtil.mapAssetFileName( newDest, options.assetExtensionMap );

			if( _.contains( options.extToCopy, getExtension( filepath ) ) )
				grunt.file.copy( filepath, newDest );

			// TODO: this section can be cleaned up
			_.each( options.preprocessingTasks, function( preprocessingTask ) {

				var taskName = preprocessingTask.name;

				// If the changed file's extension matches the task, set the file.
				if( _s.endsWith( filepath, preprocessingTask.inExt ) ) {
					grunt.config( [ taskName, kCarteroTaskPrefix ], {
						src : filepath,
						dest : newDest,
						options : preprocessingTask.options || {}
					} );
				}
			} );

			if( options.browserify ) {
				if( _s.endsWith( filepath, ".js" ) ) {
					grunt.config( [ "carterobrowserify", kCarteroTaskPrefix, "files" ], [ {
						src : filepath,
						dest : newDest
					} ] );
				}
			}

		} );

		var browserifyFiles = _.map( options.bundleAndViewDirs, function( dirOptions ) {
			return {
				cwd : dirOptions.path,
				src : [ "**/*.js" ],
				dest : dirOptions.destDir,
				expand : true
			};
		} );

		carteroBrowserify[ kCarteroTaskPrefix ] = {
			options : {
				isAutorunFile : function( filePath, fileSrc ) {
					if( isViewsFile( filePath.replace( options.projectDir + path.sep, "") ) )
						return fileSrc.indexOf( kBrowserifyAutorun ) != -1;
					else
						return _.contains( browserifyAutorunFiles, filePath.replace( options.projectDir + path.sep, "" ) );
				}
			},
			files : browserifyFiles
		};

		grunt.config( "carterobrowserify", carteroBrowserify );

		grunt.task.run( kCarteroTaskPrefix + "_clean" );
		grunt.task.run( "prepare" );
		grunt.task.run( kCarteroTaskPrefix + "_copy" );

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			grunt.task.run( preprocessingTask.name + ":" + kCarteroTaskPrefix );
		} );

		// Builds the bundleMap and pageMap to be used by later tasks
		grunt.task.run( "buildBundleAndPageJSONs:" + mode );

		if( options.browserify ) grunt.task.run( "carterobrowserify:" + kCarteroTaskPrefix );

		grunt.task.run( "replaceCarteroDirTokens" );

		// In prod mode...
		if( mode === "prod" ) {
			grunt.task.run( "replaceRelativeURLsInCSSFile" );
			grunt.task.run( "buildBundlesAndParcels" );
		}

		grunt.task.run( "buildJsCssTmplLists" );

		if( options.postProcessor )
			grunt.task.run( "runPostProcessor" );

		// Removes any files not referenced in the parcels
		grunt.task.run( "cleanup" );

		if( mode === "prod" ) {
			_.each( options.minificationTasks, function( taskConfig ) {
				grunt.task.run( taskConfig.name );
			} );
		}

		grunt.task.run( "saveCarteroJSON" );

		// In dev mode...
		if( mode === "dev" ) {
			//TODO: re-enable
			grunt.task.run( "watch" );
		}

	} );

	grunt.registerTask( kCarteroTaskPrefix + "_copy", "", function() {

		var filesToCopy = [];

		_.each( options.bundleAndViewDirs, function ( dirOptions ) {

			//console.log( dirOptions.destDir + " " + dirOptions.path );
			filesToCopy = _.union( filesToCopy, grunt.file.expandMapping(
				_.map( options.extToCopy, function( extension ) {
					return "**/*" + extension;
				} ),
				dirOptions.destDir,
				{
					cwd : dirOptions.path
				}
			) );
		} );

		//console.log( "FILES BEING COPIED:" );
		//console.log( filesToCopy );

		_.each( filesToCopy, function( fileSrcDest ) {
			grunt.file.copy( fileSrcDest.src, fileSrcDest.dest );
		} );


	} );

	grunt.registerTask( "replaceRelativeURLsInCSSFile", "", function() {

try {

		var cssFiles = [];

		_.each( parcels, function( parcel ) {
			_.each( parcel.combinedFiles, function( file ) {
				_.each( file.sourceFilePaths, function( filePath ) {
					if( _s.endsWith( filePath, ".css" ) )
						cssFiles.push( filePath );
				} );
			} );
		} );

		var done = this.async();

		console.log( "who" );

		async.each(
			cssFiles,
			function( file, callback ) {
				console.log( "hi" );
				replaceRelativeURLsInCSSFile( file, callback );
			},
			function( err ) {
				if( err ) {
					console.log( "Error while replacing relative URLs in CSS file with absolute ones: " + e );
					throw err;
				}

				done();
			}
		);
}
catch( e ) {
	console.log( e );
}

	} );

	grunt.registerTask( "runPostProcessor", "", function() {
		options.postProcessor( parcels );
	} );

	grunt.registerTask( "processViewFileChange", "", function() {
		rebundle();
	} );

	grunt.registerTask( "processBundleJSONChange", "", function() {
		rebundle();
	} );

	// Creates the assetLibrary and appPages destination directories
	grunt.registerTask( "prepare", "Prepare directories for build", function() {

		_.each( options.bundleAndViewDirs, function ( dirOptions ) {
			grunt.file.mkdir( dirOptions.destDir );
		} );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "_clean", "Clean output directories", function() {

		_.each( options.bundleAndViewDirs, function ( dirOptions ) {
			grunt.file.delete( dirOptions.destDir );
		} );

	} );

	grunt.registerTask( "buildBundleAndPageJSONs", "Build bundle and page map JSONs", function( mode ) {

		try {
			bundleMap = assetBundlerUtil.buildBundlesMap( options.library, options );

			console.log( "BUNDLES: " );
			console.log( JSON.stringify( bundleMap, null, "\t" ) );
		}
		catch( e ) {
			var errMsg = "Error while resolving bundles: " + e;
			if( mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
			
		}

		browserifyAutorunFiles = [];

		_.each( _.keys( bundleMap ), function( bundleName ) {
			var bundle = bundleMap[ bundleName ];
			browserifyAutorunFiles = _.union( browserifyAutorunFiles, bundle.browserifyAutorun );
		} );

		try {
			pageMap = assetBundlerUtil.buildPagesMap( options.views, options );
			//console.log( "PAGES: " );
			//console.log( JSON.stringify( pageMap, null, "\t" ) );
			//assetBundlerUtil.resolvePagesMap( pageMap, bundleMap, mode );
		}
		catch( e ) {
			var errMsg = "Error while resolving pages: " + e.stack;
			if( mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}

		//console.log( JSON.stringify( bundleMap, null, "\t" ) );
		//console.log( JSON.stringify( pageMap, null, "\t" ) );

		var result = cartero.doIt( bundleMap, pageMap, options );

		bundles = result.bundles;
		parcels = result.parcels;

	} );

	grunt.registerTask( "buildBundlesAndParcels", "", function() {

		_.each( _.values( bundles ), function( bundle ) {
			bundle.buildCombinedFiles();
		} );

		_.each( _.values( parcels ), function( parcel ) {
			parcel.buildCombinedFiles();
		} );

	} );

	grunt.registerTask( "buildJsCssTmplLists", "", function() {

		_.each( _.values( parcels ), function( parcel ) {
			parcel.buildResourcesToLoad();
		} );

	} );

	// Figures out which asset files aren't referenced by the pageMap or bundleMap and removes them
	grunt.registerTask( "cleanup", "", function() {

		function resolvePageMapFileName( fileName ) {
			return options.publicDir + fileName;
		}

		function resolveDynamicallyLoadedFileName( fileName ) {
			return options.assetLibrary.destDir + fileName;
		}

		var referencedFiles = [];

		_.each( parcels, function( parcel ) {

			var metadataForMode = parcel[ options.mode ];

			referencedFiles = _.union( referencedFiles, metadataForMode.js, metadataForMode.css, metadataForMode.tmpl );
			//	_.map( metadataForMode.js, resolvePageMapFileName ),
			//	_.map( metadataForMode.css, resolvePageMapFileName ),
			//	_.map( metadataForMode.tmpl, resolvePageMapFileName )
			//);

		} );

		_.each( _.values( bundleMap ), function( bundleMetadata ) {

			referencedFiles = _.union( referencedFiles, bundleMetadata.dynamicallyLoadedFiles );
			//	_.map( bundleMetadata.dynamicallyLoadedFiles, resolveDynamicallyLoadedFileName )
			//);

		} );

		console.log( "REFERENCED FILES:" );
		console.log( referencedFiles );

		var filesToClean = grunt.file.expand( {
				filter : function( fileName ) {
					//cleaning assets that are not used by any page
					return ! _.contains( referencedFiles, fileName ) && _.contains( options.cleanableAssetExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
				}
			},
			//[ options.assetLibrary.destDir + "**/*", options.appPages.destDir + "**/*" ]
			[ options.publicDir + "/**/*" ]
		);

		console.log( filesToClean );

		_.each( filesToClean, function ( file ) {
			grunt.file.delete( file );
		} );

	} );

	// Saves the bundleMap and pageMap contents to files.
	grunt.registerTask( "saveCarteroJSON", "", function() {

		var parcelDataToSave = {};
		_.each( _.values( parcels ), function( parcel ) {
			parcelDataToSave[ parcel.name ] = {
				js : parcel[mode].js || [],
				css : parcel[mode].css || [],
				tmpl : parcel[mode].tmpl || []
			};
		} );

		var carteroJSON = {};

		carteroJSON.publicDir = options.publicDir;
		carteroJSON.parcels = parcelDataToSave;
		carteroJSON.mode = options.mode;

		assetBundlerUtil.saveCarteroJSON( carteroJSON, options.projectDir );

	} );

	grunt.registerTask( "replaceCarteroDirTokens", "", function() {
		function replaceStringInFile( fileName, matchString, replaceString ) {
			var fileContents = fs.readFileSync( fileName ).toString();
			fileContents = fileContents.replace( matchString, replaceString );
			fs.writeFileSync( fileName, fileContents );
		}

		function isValidCarteroDirFile( fileName ) {
			return _.contains( options.cleanableAssetExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
		}

		var assetFiles = _.filter( findit.sync( options.publicDir ), isValidCarteroDirFile );
		_.each( assetFiles, function( fileName ) {
			replaceStringInFile( fileName, /##cartero_dir/g, fileName.replace( options.publicDir + "/", "").replace(/\/[^\/]*$/, "" ) );
		} );

	} );

	grunt.registerMultiTask( "carterobrowserify", "", function() {

		var isAutorunFile = this.options().isAutorunFile;

		function processFile( filePath, filePathDest, cb ) {

			var b = browserify();

			var fileContents = fs.readFileSync( filePath ).toString();

			if( ! _.isUndefined( isAutorunFile ) && isAutorunFile( filePath, fileContents ) ) {
				b.add( filePath );
			}

			b.require( filePath );

			var requiredFiles;

			try {
				requiredFiles = detective( fileContents );
			}
			catch( e ) {
				var errMsg =  "Failed to parse file " + filePath + ": " + e ;
				if( mode === "dev")
					grunt.fail.warn( errMsg );
				else
					grunt.fail.fatal( errMsg );
				cb( e );
				return;
			}

			_.each( requiredFiles, function( relativeRequire ) {
				var resolvedRequire = resolve.sync( relativeRequire, { basedir: filePath.replace(/\/[^\/]*$/, "" ) /*, paths : paths*/ } );
				b.external( resolvedRequire );
			} );

			b.bundle( { filter : function( fileName ) {
					return _.contains( requiredFiles, fileName );
				}
			},
			function( err, src ) {
				if( err ) {
					var errMsg =  "Error while browserifying " + filePath + " : " +  err;
					if( mode === "dev" )
						grunt.fail.warn( errMsg );
					else
						grunt.fail.fatal( errMsg );
				}
				else {
					fs.writeFileSync( filePathDest, src.toString() );
				}

				cb( err );
			} );
		}

		var done = this.async();

		async.each(
			this.files,
			function( file, callback ) {
				//var realPath = fs.realpathSync( file.src[0] );
				var realPath = path.join( options.projectDir, file.src[ 0 ] );
				processFile( realPath , /*fs.realpathSync( */file.dest /*)*/, callback );
			},
			function( err ) {
				//user notified of errors (if any) while each file is bundled
				done();
			}
		);
	} );
};
