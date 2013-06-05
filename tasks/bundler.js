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
	var assetBundlerTaskPrefix = "ASSET_BUNDLER";

	// Map of file extension to tasks that need to be run when a modification happens (used by watch task)
	var assetFileExtensionsMap = {
		js : {
			tasks : [ "replaceBundlerDirTokens" ]
		},
		css : {
			tasks : [ "replaceBundlerDirTokens" ]
		},
		tmpl : {
			tasks : [ "replaceBundlerDirTokens" ]
		},
		png : {
			tasks : []
		},
		gif : {
			tasks : []
		},
		jpg : {
			tasks : []
		}
	};

	// Create a list of globbing patterns to be used by the watch task.
	var kAssetFileExtensions = _.map( _.keys( assetFileExtensionsMap ), function( extension ) {
		return "**/*." + extension;
	} );

	// File where bundle metadata is stored.
	var kBundleMapJSONFile = "bundleMap.json";

	// File where page metadata is stored.
	var kPageMapJSONFile = "pageMap.json";

	var kBundleAssetsDirPrefix = "bundle-assets-";
	var kViewAssetsDirPrefix = "view-assets-";

	// assetBundler directive: When browserify is enabled, this directive is used in js files in appPages that should be automatically run upon loading.
	var kBrowserifyAutorun = "#bundler_browserify_autorun";

	// Default values for the appPages task option.
	var kViewDirDefaults = {
		filesToIgnore : /_.*/,
		foldersToIgnore : /__.*/,
		pageFileRegExp : /.*.swig$/
	};

	// Default values for the assetLibrary task option.
	var kBundleDirDefaults = {
	};

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

	function resolveAssetFilePath( fileName ) {
		return fileName.replace( "{ASSET_LIBRARY}/", options.assetLibrary.destDir ).replace( "{APP_PAGES}/", options.appPages.destDir );
	}

	// Convenience function that is used by the watch tasks when assetBundler metadata changes and the pageMap and bundleMap need to be rebuilt.
	function rebundle() {
		grunt.task.run( "buildBundleAndPageJSONs:" + mode );
		grunt.task.run( "resolveAndInjectDependencies:dev" );
		grunt.task.run( "saveBundleAndPageJSONs" );
	}

	// Processes a CSS file looking for url().  Replaces relative paths with absolute ones ( to the staticDir ).
	// TODO: make this stuff async.
	function replaceRelativeURLsInCSSFile( fileName ) {
			var fileContents = fs.readFileSync( fileName ).toString();

			fileContents = fileContents.replace( /url\(([^)]+)\)/g, function( match, url ) {
				// don't need to do anything with absolute urls
				if( url[0] === "/" ) return match;

				var absolutePath = fileName.replace(/\/[^\/]*$/,"/") + path.sep + url;

				if( fs.existsSync( absolutePath ) )
					return "url(" + fs.realpathSync( fileName.replace(/\/[^\/]*$/,"/") + path.sep + url ).replace( fs.realpathSync( options.staticDir ), "" ) + ")";
				else
					return match;

			} );

			fs.writeFileSync( fileName, fileContents );

	}

	grunt.registerMultiTask( "assetbundler", "Your task description goes here.", function() {

try {


		// Grab the options and apply defaults
		options = this.options();

		// apply the defaults to all bundleDirs and add the destination directory
		options.bundleDirs = _.map( options.bundleDirs, function( bundleDir ) {
			var bundleDirWithDefaults = _.extend( {}, kBundleDirDefaults, bundleDir );
			bundleDirWithDefaults.destDir = path.join( options.staticDir, kBundleAssetsDirPrefix + bundleDirWithDefaults.namespace );
			return bundleDirWithDefaults;
		} );

		// apply the defaults to all viewDirs and add destination directory
		var viewAssetsDirCounter = 0;
		options.viewDirs = _.map( options.viewDirs, function( viewDir ) {
			var viewDirWithDefaults = _.extend( {}, kViewDirDefaults, viewDir );
			viewDirWithDefaults.destDir = path.join( options.staticDir, kViewAssetsDirPrefix + viewAssetsDirCounter++ );
			return viewDirWithDefaults;
		} );

		options.bundleAndViewDirs = _.union( options.bundleDirs, options.viewDirs );

		options = _.extend(
			{},
			{
				useDirectoriesForDependencies : true,
				requirify : false
			},
			options
		);

		options.preprocessingTasks = _.map( options.preprocessingTasks, function( preprocessingTask ) {
			var defaults = compileAssetsMap[ preprocessingTask.name ] || {};
			var result = _.extend( {}, defaults, preprocessingTask );
			if( _.isUndefined( result.outExt ) )
				result.outExt = result.inExt;
			return result;
		} );

		mode = options.mode;

		var watch = grunt.config( "watch" ) || {};
		var requirify = grunt.config( "requirify" ) || {};

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

			task[ assetBundlerTaskPrefix ] = {
				files : files
			};

			if( ! _.isUndefined( preprocessingTask.options ) ) {
				task[ assetBundlerTaskPrefix ].options = preprocessingTask.options;
			}

			console.log( "configured " + taskName + ":" );
			console.log( JSON.stringify( task, null, "\t" ) );

			grunt.config( taskName, task );

			//TODO: Oleg: we don't really support requirifying none js files...
			//if( options.requirify && taskOptions.dest === ".js" )
			//	tasksToRun.push( "requirify:" + assetBundlerTaskPrefix );

			if( taskName !== "compass" )
				watch[ assetBundlerTaskPrefix + "_" + taskName ] = {
					files : _.map( options.bundleAndViewDirs, function ( dir ) {
						return dir.path + "/**/*" + preprocessingTask.inExt;
					} ),
					tasks : [ taskName + ":" + assetBundlerTaskPrefix ],
					options : {
						nospawn : true
					}
				};
		} );


// 		// Loop through assets that need preprocessing
// 		_.each( _.keys( compileAssetsMap ), function( taskName ) {

// 			// Get the configuration for this task if it exists or create a new one
// 			var task = grunt.config( taskName ) || {};

// 			var taskOptions = compileAssetsMap[ taskName ];

// 			var userSpecifiedOptions;

// 			// Check to see if the user specified their own options for this preprocessing task
// 			if( ! _.isUndefined( options.preprocessingOptions ) ) {
// 				userSpecifiedOptions = options.preprocessingOptions[ taskName ];
// 			}

// 			// Special case for compass (which doesn't seem to support the usual files options)
// 			if( taskName === "compass" ) {

// 				//TODO: fix for new options
// 				// if( _.isUndefined( userSpecifiedOptions ) ) userSpecifiedOptions = {};

// 				// var assetLibraryOptions = _.extend( {}, {
// 				// 	sassDir : options.assetLibrary.srcDir,
// 				// 	cssDir : options.assetLibrary.destDir
// 				// },
// 				// userSpecifiedOptions );

// 				// task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
// 				// 	options : assetLibraryOptions
// 				// };

// 				// var appPagesOptions = _.extend( {}, {
// 				// 	sassDir : options.appPages.srcDir,
// 				// 	cssDir : options.appPages.destDir
// 				// },
// 				// userSpecifiedOptions );

// 				// task[ assetBundlerTaskPrefix + "_appPages" ] = {
// 				// 	options : appPagesOptions
// 				// };

// 			}
// 			else {

// 				var files = [];

// 				_.each( options.bundleAndViewDirs, function( dir ) {
// 					files.push( {
// 						expand: true,
// 						cwd: dir.path,
// 						src: [ "**/*" + taskOptions.src ],
// 						dest: dir.destDir,
// 						ext: taskOptions.dest
// 					} );
// 				} );

// 				task[ assetBundlerTaskPrefix ] = {
// 					files : files
// 				};


// 				if( ! _.isUndefined( userSpecifiedOptions ) ) {
// 					task[ assetBundlerTaskPrefix ].options = userSpecifiedOptions;
// 				}

// 				// Create and configure targets for the task
// //				task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
// //						expand: true,
// //					cwd: options.assetLibrary.srcDir,
// //					src: [ "**/*" + taskOptions.src ],
// //					dest: options.assetLibrary.destDir,
// //					ext: taskOptions.dest
// //				};
// //
// //				task[ assetBundlerTaskPrefix + "_appPages" ] = {
// //					expand: true,
// //					cwd: options.appPages.srcDir,
// //					src: [ "**/*" + taskOptions.src ],
// //					dest: options.appPages.destDir,
// //					ext: taskOptions.dest
// //				};





// 			}

// 			//task[ assetBundlerTaskPrefix ] = {};

// 			grunt.config( taskName, task );

// 		} );

		// Create targets for each minification task.
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

			task[ assetBundlerTaskPrefix ] = {
				files : files,
				options : minificationTask.options || {}
			};

			grunt.config( minificationTask.name, task );

			//TODO: add support for multiple suffixes
			// task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
			// 	options : taskConfig.options,
			// 	expand: true,
			// 	cwd: options.assetLibrary.destDir,
			// 	src: [ "**/*" + taskConfig.suffixes[0] ],
			// 	rename: function(dest, src){ return dest + src; },
			// 	dest: options.assetLibrary.destDir
			// 	//ext: taskConfig.suffixes[0]
			// };

			// task[ assetBundlerTaskPrefix + "_appPages" ] = {
			// 	options : taskConfig.options,
			// 	expand: true,
			// 	cwd: options.appPages.destDir,
			// 	src: [ "**/*" + taskConfig.suffixes[0] ],
			// 	rename: function(dest, src){ return dest + src; },
			// 	dest: options.appPages.destDir
			// 	//ext: taskConfig.suffixes[0]
			// };

		} );

		// // Loop through the assets that require preprocessing and create/configure the target
		// _.each( _.keys( compileAssetsMap ), function( taskName ) {

		// 	var taskOptions = compileAssetsMap[ taskName ];

		// 	var tasksToRun;

		// 	if( taskName === "compass" ) {
		// 		//TODO: fix to support new options
		// 		// tasksToRun = [
		// 		// 	taskName + ":" + assetBundlerTaskPrefix + "_assetLibrary",
		// 		// 	taskName + ":" + assetBundlerTaskPrefix + "_appPages"
		// 		// ];
		// 	}
		// 	else {
		// 		//TODO: Oleg: don't think we need to copy here...
		// 		tasksToRun = [ taskName + ":" + assetBundlerTaskPrefix ];
		// 	}

		// 	//TODO: Oleg: we don't really support requirifying none js files...
		// 	if( options.requirify && taskOptions.dest === ".js" )
		// 		tasksToRun.push( "requirify:" + assetBundlerTaskPrefix );

		// 	if( taskName !== "compass" )
		// 		watch[ assetBundlerTaskPrefix + "_" + taskName ] = {
		// 			files : _.map( options.bundleAndViewDirs, function ( dir ) {
		// 				return dir.path + "**/*" + taskOptions.src;
		// 			} ),
		// 			tasks : tasksToRun,
		// 			options : {
		// 				nospawn : true
		// 			}
		// 		};

		// } );

		// Loop through the assets that don't require preprocessing and create/configure the target
		_.each( assetFileExtensionsMap, function( val, key ) {

			var tasksToRun = _.union([], val.tasks );

			if( options.requirify && key === "js" )
				tasksToRun.push( "requirify:" + assetBundlerTaskPrefix );

			watch[ assetBundlerTaskPrefix + "_" + key ] = {
				files : _.map( options.bundleAndViewDirs, function ( dir ) {
					return dir.path + "/**/*" + key;
				} ),
				tasks : tasksToRun,
				options : {
					nospawn : true
				}
			};
		} );

		// TODO: this should somehow be using options.appPages.pageFileRegExp
		watch[ assetBundlerTaskPrefix + "_server-side-template" ] = {
			files : _.map( options.viewDirs, function ( dir ) {
					return dir.path + "/**/*" + options.serverSideTemplateSuffix;
				} ),
			tasks : [ "processServerSideTemplateChange" ],
			options : {
				nospawn : true
			}
		};

		// Watch changes to bundle.json files
		watch[ assetBundlerTaskPrefix + "_bundle_json" ] = {
			files : _.map( options.viewDirs, function ( dir ) {
					return dir.path + "/**/*" + "**/bundle.json";
				} ),
			tasks : [ "processBundleJSONChange" ],
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );

		grunt.event.on( "watch", function( action, filepath ) {
try {


			//if the file is new, rebuild all the bundle stuff (if its a pageFile or bundle.json file, this is already handled by the watch )
			if( ( action === "added" || action === "deleted" ) && ! options.appPages.pageFileRegExp.test( filepath ) && ! _s.endsWith( filepath, "bundle.json" ) ) {
				rebundle();
			}

			var dirOptions = _.find( options.bundleAndViewDirs, function( dirOptions ) {
				return filepath.indexOf( dirOptions.path ) === 0;
			} );

			//var isAssetLibraryFile = _s.startsWith( filepath, options.assetLibrary.srcDir );

			var newDest = filepath.replace( dirOptions.path, dirOptions.destDir );

			//if( isAssetLibraryFile )
			//	newDest = filepath.replace( options.assetLibrary.srcDir, options.assetLibrary.destDir );
			//else
			//	newDest = filepath.replace( options.appPages.srcDir, options.appPages.destDir );

			newDest = assetBundlerUtil.mapAssetFileName( newDest );

			// Note, copy should only be run for files not requiring pre-compilation
			grunt.file.copy( filepath, newDest );

			// TODO: this section can be cleaned up
			//_.each( _.keys( compileAssetsMap ), function( taskName ) {
			_.each( options.preprocessingTasks, function( preprocessingTask ) {

				//TODO: handle compass, for now itll just rerun for all files
				//if( taskName === "compass" ) return;

				//var taskOptions = compileAssetsMap[ taskName ];

				var tempFile = [];
				var tempDest = [];

				var taskName = preprocessingTask.name;


				// If the changed file's extension matches the task, set the file.
				if( _s.endsWith( filepath, preprocessingTask.inExt ) ) {
					tempFile = filepath;
					tempDest = newDest;
				}

				//var userSpecifiedOptions;

				//if( ! _.isUndefined( options.preprocessingOptions ) ) {
				//	userSpecifiedOptions = options.preprocessingOptions[ taskName ];
				//}

				// Set the src and dest.
				grunt.config( [ taskName, assetBundlerTaskPrefix ], {
					src : tempFile,
					dest : tempDest,
					options : preprocessingTask.options || {}
				} );

				console.log( JSON.stringify( grunt.config( taskName ), null, "\t" ) );

			} );

			if( options.requirify ) {
				if( _s.endsWith( filepath, ".js" ) ) {
					grunt.config( [ "requirify", assetBundlerTaskPrefix, "files" ], [ {
						src : filepath,
						dest : newDest
					} ] );
				}
				else {
					grunt.config( [ "requirify", assetBundlerTaskPrefix, "files" ], [ {
						src : []
					} ] );
				}
			}

		}
		catch( e ) {
			console.log( e.stack );
			throw e;
		}

		} );

		//TODO: fix to use new options structure
		// var assetLibraryPath = fs.realpathSync( options.assetLibrary.srcDir );
		// var appPagesPath = fs.realpathSync( options.appPages.srcDir );

		// var relativeAssetLibraryDir = options.assetLibrary.destDir.replace( options.staticDir, "/" );
		// var relativeAppPagesDir = options.appPages.destDir.replace( options.staticDir, "/" );

		// requirify[ assetBundlerTaskPrefix ] = {
		// 	options : {
		// 		// Used to replace #bundler_dir tokens in files during browserification
		// 		transformFunction : function ( file ) {
		// 			var data = '';
		// 			return through(write, end);

		// 			function write (buf) { data += buf }
		// 			function end () {
		// 				var replaceString = "";
		// 				if( file.indexOf( assetLibraryPath) == 0 )
		// 					replaceString = relativeAssetLibraryDir + file.replace( assetLibraryPath + path.sep, "").replace(/\/[^\/]*$/, "" );
		// 				else
		// 					replaceString = relativeAppPagesDir + file.replace( appPagesPath + path.sep, "").replace(/\/[^\/]*$/, "" );
		// 				//replace string should be of the form AssetLibrary-assets/... or AppPages-assets/...
		// 				this.queue(data.toString().replace( /#bundler_dir/g, replaceString.substring(1) ) );
		// 				this.queue(null);
	 //  				}
		// 		},
		// 		isAutorunFile : function( filePath, fileSrc ) {
		// 			if( filePath.indexOf( appPagesPath ) === 0 )
		// 				return fileSrc.indexOf( kBrowserifyAutorun ) != -1;
		// 			else
		// 				return _.contains( browserifyAutorunFiles, filePath.replace( assetLibraryPath + path.sep, "" ) );
		// 		}
		// 	},
		// 	files : [ {
		// 			cwd : options.assetLibrary.srcDir,
		// 			src : [ "**/*.js" ],
		// 			dest : options.assetLibrary.destDir,
		// 			expand : true
		// 		},
		// 		{
		// 			cwd : options.appPages.srcDir,
		// 			src : [ "**/*.js" ],
		// 			dest : options.appPages.destDir,
		// 			expand : true
		// 		}
		// 	]
		// };

		// grunt.config( "requirify", requirify );

		grunt.task.run( assetBundlerTaskPrefix + "_clean" );
		grunt.task.run( "prepare" );
		grunt.task.run( assetBundlerTaskPrefix + "_copy" );

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			//TODO: support compass
			//if( taskName !== "compass" )
				grunt.task.run( preprocessingTask.name + ":" + assetBundlerTaskPrefix );
		} );

		// Builds the bundleMap and pageMap to be used by later tasks
		grunt.task.run( "buildBundleAndPageJSONs:" + mode );

		//NOTE: requirify will 'redo' replacing of #bundler_dir tokens in js files if requirify is true
		grunt.task.run( "replaceBundlerDirTokens" );

		if( options.requirify ) grunt.task.run( "requirify:" + assetBundlerTaskPrefix );

		grunt.task.run( "resolveAndInjectDependencies:dev" );

		// In prod mode...
		if( mode === "prod" ) {

			grunt.task.run( "replaceRelativeURLsInCSSFile" );

			grunt.task.run( "buildKeepSeparateBundles" );
			grunt.task.run( "buildPageBundles" );

			//TODO: only run the asset bundler targets
			_.each( options.minificationTasks, function( taskConfig ) {
				grunt.task.run( taskConfig.name );
			} );

			grunt.task.run( "resolveAndInjectDependencies:prod");

			if( options.postProcessor )
				grunt.task.run( "runPostProcessor" );
		}

		// Removes any files not referenced in the pageMap
		grunt.task.run( "doCleanup" );

		// Saves the bundleMap and pageMap to files.
		grunt.task.run( "saveBundleAndPageJSONs" );

}
catch ( e ) {
	console.log( e.stack );
}

		// In dev mode...
		if( mode === "dev" ) {
			//TODO: re-enable
			grunt.task.run( "watch" );
		}

	} );

	grunt.registerTask( assetBundlerTaskPrefix + "_copy", "", function() {

		var filesToCopy = [];

		_.each( options.bundleAndViewDirs, function ( dirOptions ) {

			console.log( dirOptions.destDir + " " + dirOptions.path );
			filesToCopy = _.union( filesToCopy, grunt.file.expandMapping(
				kAssetFileExtensions,
				dirOptions.destDir,
				{
					cwd : dirOptions.path
				}
			) );
		} );

		console.log( "FILES BEING COPIED:" );
		console.log( filesToCopy );

		_.each( filesToCopy, function( fileSrcDest ) {
			grunt.file.copy( fileSrcDest.src, fileSrcDest.dest );
		} );


	} );

	grunt.registerTask( "replaceRelativeURLsInCSSFile", "", function() {

		_.each( parcels, function( parcel ) {
			_.each( parcel.combinedFiles, function( file ) {
				_.each( file.sourceFilePaths, function( filePath ) {
					replaceRelativeURLsInCSSFile( filePath );
				} );
			} );
		} );
	} );

	grunt.registerTask( "runPostProcessor", "", function() {
		//console.log( JSON.stringify( pageMap, null, "\t" ) );
		options.postProcessor( parcels );
	} );

	grunt.registerTask( "processServerSideTemplateChange", "", function() {
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

		var configOptions = {
			mode : options.mode//,
			//assetLibrarySrc : options.assetLibrary.srcDir,
			//assetLibraryDest : options.assetLibrary.destDir,
			//appPagesSrc : options.appPages.srcDir,
			//appPagesDest : options.appPages.destDir
		};

		grunt.config.set( "configOptions", configOptions );

		assetBundlerUtil.saveBundlerConfig( configOptions );

	} );

	grunt.registerTask( assetBundlerTaskPrefix + "_clean", "Clean output directories", function() {

		_.each( options.bundleAndViewDirs, function ( dirOptions ) {
			grunt.file.delete( dirOptions.destDir );
		} );
	} );

	grunt.registerTask( "buildBundleAndPageJSONs", "Build bundle and page map JSONs", function( mode ) {

		try {
			bundleMap = assetBundlerUtil.buildBundlesMap( options.bundleDirs, options);

			console.log( "BUNDLES: " );
			console.log( JSON.stringify( bundleMap, null, "\t" ) );
			//assetBundlerUtil.resolveBundlesMap( bundleMap, mode );
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
			pageMap = assetBundlerUtil.buildPagesMap( options.viewDirs );
			console.log( "PAGES: " );
			console.log( JSON.stringify( bundleMap, null, "\t" ) );
			//assetBundlerUtil.resolvePagesMap( pageMap, bundleMap, mode );
		}
		catch( e ) {
			var errMsg = "Error while resolving pages: " + e.stack;
			if( mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}

		console.log( JSON.stringify( bundleMap, null, "\t" ) );
		console.log( JSON.stringify( pageMap, null, "\t" ) );

try {
			var result = cartero.doIt( bundleMap, pageMap, options );

		bundles = result.bundles;
		parcels = result.parcels;
}
catch( e ) { 
	console.log( e.stack );
	throw e;
}


	} );

	grunt.registerTask( "buildKeepSeparateBundles", "Builds the keep separate bundle files.", function() {

		_.each( _.values( bundles ), function( bundle ) {
			bundle.buildCombinedFiles();
		} );

	} );

	grunt.registerTask( "buildPageBundles", "Builds the bundles for each page", function() {

		this.requires( "buildBundleAndPageJSONs:prod" );

		_.each( _.values( parcels ), function( parcel ) {
			parcel.buildCombinedFiles();
		} );

	} );


	grunt.registerTask( "resolveAndInjectDependencies", "", function( mode ) {

		_.each( _.values( parcels ), function( parcel ) {
			parcel.buildResourcesToLoad( options.staticDir, mode );
		} );

	} );

	// Figures out which asset files aren't referenced by the pageMap or bundleMap and removes them
	grunt.registerTask( "doCleanup", "", function() {

		function resolvePageMapFileName( fileName ) {
			return options.staticDir + fileName;
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

		var filesToClean = grunt.file.expand( {
				filter : function( fileName ) {
					//cleaning assets that are not used by any page
					return ! _.contains( referencedFiles, fileName ) && assetBundlerUtil.isAssetFile( fileName );
				}
			},
			//[ options.assetLibrary.destDir + "**/*", options.appPages.destDir + "**/*" ]
			[ options.staticDir + "**/*" ]
		);

		_.each( filesToClean, function ( file ) {
			grunt.file.delete( file );
		} );

	} );

	// Saves the bundleMap and pageMap contents to files.
	grunt.registerTask( "saveBundleAndPageJSONs", "Persist the page and bundle JSONs", function() {

		var parcelDataToSave = {};
		_.each( _.values( parcels ), function( parcel ) {
			parcelDataToSave[ parcel.name ] = {
				js : parcel[mode].js || [],
				css : parcel[mode].css || [],
				tmpl : parcel[mode].tmpl || []
			};
		} );

		assetBundlerUtil.saveBundleMap( bundleMap );
		assetBundlerUtil.savePageMap( parcelDataToSave );

	} );

	grunt.registerTask( "replaceBundlerDirTokens", "", function() {
		function replaceStringInFile( fileName, matchString, replaceString ) {
			var fileContents = fs.readFileSync( fileName ).toString();
			fileContents = fileContents.replace( matchString, replaceString );
			fs.writeFileSync( fileName, fileContents );
		}

		//var relativeAssetLibraryDir = options.assetLibrary.destDir.replace( options.staticDir, "" );
		//var relativeAppPagesDir = options.appPages.destDir.replace( options.staticDir, "" );


		var assetFiles = _.filter( findit.sync( options.staticDir ), assetBundlerUtil.isAssetFile );
		_.each( assetFiles, function( fileName ) {
			replaceStringInFile( fileName, /#bundler_dir/g, fileName.replace( options.staticDir + "/", "").replace(/\/[^\/]*$/, "" ) );
		} );

		//var appPagesFiles = _.filter( findit.sync( options.appPages.destDir ), assetBundlerUtil.isAssetFile );
		//_.each( appPagesFiles, function( fileName ) {
		//	replaceStringInFile( fileName, /#bundler_dir/g, fileName.replace( options.staticDir, "").replace(/\/[^\/]*$/, "" ) );
		//} );

	} );

	grunt.registerMultiTask( "requirify", "", function() {

		var transformFunction = this.options().transformFunction;
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

			b.transform( transformFunction );

			b.bundle( function( err, src ) {
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

		var validFiles = [];

/*

		_.each( _.values( pageMap ), function( page ) {
			validFiles = _.union( validFiles, _.map( _.filter( page.files, function( file ) { return _s.endsWith( file, ".js") ; } ), function( fileName ) {
				return fileName.replace( "{APP_PAGES}/",  options.appPages.srcDir );
			}) );
		} );

		_.each( _.values( bundleMap ), function( bundle ) {
			validFiles = _.union( validFiles, _.map( _.filter( bundle.files, function( file ) { return _s.endsWith( file, ".js") ; } ), function( fileName ) {
				return fileName.replace( "{ASSET_LIBRARY}/",  options.assetLibrary.srcDir );
			}) );
		} );
*/

		//console.log( _.pluck( parcels, "combinedFiles" ) );

		_.each( _.values( parcels ), function( bundle ) {
			var filePaths = [];
			if( options.mode === "dev" )
				filePaths = _.pluck( bundle.combinedFiles, "path" );
			else {
				_.each( bundle.combinedFiles, function( file ) {
					filePaths = _.union( filePaths, file.sourceFilePaths );
				} );
			}
			validFiles = _.union( validFiles,
				_.map(
					_.filter(
						filePaths,//_.pluck( bundle.combinedFiles, "path" ),
						function( filePath ) {
							return _s.endsWith( filePath, ".js" );
						} ),
					function( filePath ) {
						//Need to convert files with destination directory back to source directory
						return filePath.replace( options.appPages.destDir, options.appPages.srcDir ).replace( options.assetLibrary.destDir, options.assetLibrary.srcDir );
					} ) );
		} );

		async.each(
			this.files,
			function( file, callback ) {
				var realPath = fs.realpathSync( file.src[0] );

				console.log( file.src[0] );
				if( _.contains( validFiles, file.src[0] ) ) {
					processFile( realPath , fs.realpathSync( file.dest ), callback );
				}
				else {
					callback();
				}
					
			},
			function( err ) {
				//user notified of errors (if any) while each file is bundled
				done();
			}
		);

	} );

};
