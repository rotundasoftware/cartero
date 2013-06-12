/*
 * grunt-asset-bundler
 * https://github.com/go-oleg/bundler
 *
 * Copyright (c) 2013 Oleg Seletsky
 * Licensed under the MIT license.
 */

var carteroUtil = require( "./../lib/util.js" ),
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
	Bundle = require( "./../lib/bundle" ),
	Parcel = require( "./../lib/parcel" ),
	File = require( "./../lib/file" );

'use strict';

module.exports = function(grunt) {

	// Prefix for all task targets added by assetBundler to avoid conflicts with already existing targets.
	var kCarteroTaskPrefix = "cartero_";

	var kLibraryAssetsDirPrefix = "library-assets-";
	var kViewAssetsDirPrefix = "view-assets-";

	var kRequiredConfigOptions = [ "mode", "projectDir", "publicDir", "library", "views", "tmplExt" ];
	var kRequiredLibraryConfigOptions = [ "path" ];
	var kRequiredViewsConfigOptions = [ "path", "viewFileExt" ];

	// cartero directive: When browserify is enabled, this directive is used in js files in views that should be automatically run upon loading.
	var kbrowserifyExecuteOnLoad = "##cartero_browserify_executeOnLoad";

	// Default values for the views task option.
	var kViewsDirDefaults = {
		filesToIgnore : /^_.*/,
		directoriesToIgnore : /^__.*/,
		directoriesToFlatten : /^_.*/
	};

	// Default values for the library task option.
	var kLibraryDirDefaults = {
		childrenDependOnParents : true,
		directoriesToFlatten : /^_.*/
	};

	// Global default values
	var kOptionsDefaults = {
		browserify : false
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

	var bundleRegistry = {};
	var parcelRegistry = {};

	// Files that are browserified and need to be run upon loading.
	var browserifyExecuteOnLoadFiles = [];

	// Convenience function that is used by the watch tasks when assetBundler metadata changes and the pageMap and bundleMap need to be rebuilt.
	function rebundle() {
		grunt.task.run( kCarteroTaskPrefix + "buildBundleAndParcelRegistries:" + mode );
		grunt.task.run( kCarteroTaskPrefix + "buildJsCssTmplLists:dev" );
		grunt.task.run( kCarteroTaskPrefix + "saveCarteroJson" );
	}

	// Processes a CSS file looking for url().  Replaces relative paths with absolute ones ( to the staticDir ).
	function makeUrlsAbsoluteInCssFile( fileName, callback ) {
		fs.readFile( fileName, function( err, data ) {

			var fileContents = data.toString().replace( /url\(([^)]+)\)/g, function( match, url ) {
				// we don't support absolute URLs for now
				if( url[0] === "/" ) return match;

				var pathRelativeToProjectDir = fileName.replace(/\/[^\/]*$/,"/") + path.sep + url;

				// sanity check: make sure url() contains a file path
				if( fs.existsSync( pathRelativeToProjectDir ) ) {
					return "url(" + pathRelativeToProjectDir.replace( options.publicDir, "" ) + ")";
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

	function configureCarteroBrowserifyTask( libraryAndViewDirs, projectDir ) {

		var carteroBrowserify = grunt.config( kCarteroTaskPrefix + "browserify" ) || {};

		var browserifyFiles = _.map( libraryAndViewDirs, function( dirOptions ) {
			return {
				cwd : dirOptions.path,
				src : [ "**/*.js" ],
				dest : dirOptions.destDir,
				expand : true
			};
		} );

		carteroBrowserify[ "default" ] = {
			files : browserifyFiles
		};

		grunt.config( kCarteroTaskPrefix + "browserify", carteroBrowserify );
	}

	function configureUserDefinedTask( libraryAndViewDirs, taskConfig, doWatch, sourceIsDest ) {
		var taskName = taskConfig.name;
		var task = grunt.config( taskName ) || {};
		var files = [];

		_.each( libraryAndViewDirs, function( dir ) {
			files.push( {
				expand: true,
				cwd: sourceIsDest ? dir.destDir : dir.path,
				src: [ "**/*" + taskConfig.inExt ],
				dest: dir.destDir,
				ext: taskConfig.outExt
				} );
		} );

		task[ kCarteroTaskPrefix ] = {
			files : files
		};

		if( ! _.isUndefined( taskConfig.options ) ) {
			task[ kCarteroTaskPrefix ].options = taskConfig.options;
		}

		grunt.config( taskName, task );

		// Configure a watch target to watch files with an `inExt` extension
		// and run the preprocessing task.

		if( doWatch ) {
			var watch = grunt.config( "watch" ) || {};

			watch[ kCarteroTaskPrefix + taskName ] = {
				files : _.map( libraryAndViewDirs, function ( dir ) {
					return dir.path + "/**/*" + taskConfig.inExt;
				} ),
				tasks : [ taskName + ":" + kCarteroTaskPrefix ],
				options : {
					nospawn : true
				}
			};

			grunt.config( "watch", watch );
		}
	}

	function registerWatchTaskListener( libraryAndViewDirs, browserify, extToCopy, assetExtensionMap ) {

		grunt.event.on( "watch", function( action, filepath ) {

			//if the file is new, rebuild all the bundle stuff (if its a pageFile or bundle.json file, this is already handled by the watch )
			if( ( action === "added" || action === "deleted" ) && ! isViewFile( filePath ) && ! _s.endsWith( filepath, "bundle.json" ) ) {
				rebundle();
			}

			var dirOptions = _.find( libraryAndViewDirs, function( dirOptions ) {
				return filepath.indexOf( dirOptions.path ) === 0;
			} );

			var newDest = filepath.replace( dirOptions.path, dirOptions.destDir );

			newDest = carteroUtil.mapAssetFileName( newDest, assetExtensionMap );

			if( _.contains( extToCopy, File.getFileExtension( filepath ) ) )
				grunt.file.copy( filepath, newDest );

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

			if( browserify ) {
				if( _s.endsWith( filepath, ".js" ) ) {
					grunt.config( [ kCarteroTaskPrefix + "browserify", "default", "files" ], [ {
						src : filepath,
						dest : newDest
					} ] );
				}
			}

		} );
	}

	function configureWatchTaskForJsCssTmpl( libraryAndViewDirs, ext, validCarteroDirExt ) {

		var watch = grunt.config( "watch" ) || {};
		var tasksToRun =  [];

		if( options.browserify && ext === ".js" )
			tasksToRun.push( kCarteroTaskPrefix + "browserify" );

		if( _.contains( validCarteroDirExt, ext ) )
			tasksToRun.push( kCarteroTaskPrefix + "replaceCarteroDirTokens" );

		watch[ kCarteroTaskPrefix + ext ] = {
			files : _.map( libraryAndViewDirs, function ( dir ) {
				return dir.path + "/**/*" + ext;
			} ),
			tasks : tasksToRun,
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );
	}

	function queueTasksToRun( mode, preprocessingTasks, minificationTasks, postProcessor ) {

		grunt.task.run( kCarteroTaskPrefix + "clean" );
		grunt.task.run( kCarteroTaskPrefix + "prepare" );
		grunt.task.run( kCarteroTaskPrefix + "copy" );

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			grunt.task.run( preprocessingTask.name + ":" + kCarteroTaskPrefix );
		} );

		// Builds the bundleMap and pageMap to be used by later tasks
		grunt.task.run( kCarteroTaskPrefix + "buildBundleAndParcelRegistries:" + mode );

		if( options.browserify ) grunt.task.run( kCarteroTaskPrefix + "browserify" );

		grunt.task.run( kCarteroTaskPrefix + "replaceCarteroDirTokens" );

		// In prod mode...
		if( mode === "prod" ) {
			grunt.task.run( kCarteroTaskPrefix + "replaceRelativeUrlsInCssFile" );
			grunt.task.run( kCarteroTaskPrefix + "buildCombinedFiles" );
		}

		grunt.task.run( kCarteroTaskPrefix + "seperateFilesToServeByType" );

		if( options.postProcessor )
			grunt.task.run( kCarteroTaskPrefix + "runPostProcessor" );

		// Removes any files not referenced in the parcels
		grunt.task.run( kCarteroTaskPrefix + "cleanup" );

		if( mode === "prod" ) {
			_.each( options.minificationTasks, function( taskConfig ) {
				grunt.task.run( taskConfig.name );
			} );
		}

		grunt.task.run( kCarteroTaskPrefix + "saveCarteroJson" );

		// In dev mode...
		if( mode === "dev" ) {
			grunt.task.run( "watch" );
		}
	}

	function configureWatchViewFile( options ) {

		var watch = grunt.config( "watch" ) || {};
		var viewFilePatterns = [];

		_.each( options.views, function( dirOptions ) {
			_.each( dirOptions.viewFileExt, function( ext ) {
				viewFilePatterns.push( dirOptions.path + "/**/*" + ext );
			} );
		} );

		watch[ kCarteroTaskPrefix + "_view_file" ] = {
			files : viewFilePatterns,
			tasks : [ "processViewFileChange" ],
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );

	}

	function configureWatchBundleJson( options ) {

		var watch = grunt.config( "watch" ) || {};

		// Watch changes to bundle.json files
		watch[ kCarteroTaskPrefix + "_bundle_json" ] = {
			files : _.map( options.views, function ( dir ) {
					return dir.path + "/**/bundle.json";
				} ),
			tasks : [ "processBundleJsonChange" ],
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );
	}

	function configureCarteroTask( taskName, options ) {

		var taskConfig = grunt.config( kCarteroTaskPrefix + taskName ) || {};

		taskConfig.options = options;

		grunt.config( kCarteroTaskPrefix + taskName, taskConfig );

	}

	function validateConfigOptions( options ) {

		_.each( kRequiredConfigOptions, function( configOption ) {
			if( _.isUndefined( options[ configOption ] ) )
				grunt.fail.fatal( "Option " + configOption + " is required.  Please add it to your cartero task configuration before proceeding." );
		} );

		_.each( options.library, function( dirOptions ) {
			_.each( kRequiredLibraryConfigOptions, function( configOption ) {
				if( _.isUndefined( dirOptions[ configOption ] ) )
					grunt.fail.fatal( "Option " + configOption + " in the `library` option is required.  Please add it to your cartero task configuration before proceeding." );
			} );
		} );

		_.each( options.views, function( dirOptions ) {
			_.each( kRequiredViewsConfigOptions, function( configOption ) {
				if( _.isUndefined( dirOptions[ configOption ] ) )
					grunt.fail.fatal( "Option " + configOption + " in the `views` option is required.  Please add it to your cartero task configuration before proceeding." );
			} );
		} );

	}

	function applyDefaultsAndSanitize( options ) {

		options.projectDir = _s.rtrim( options.projectDir, "/" );
		options.publicDir = _s.rtrim( options.publicDir, "/" );

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
			bundleDirWithDefaults.path = _s.rtrim( bundleDirWithDefaults.path, "/" );
			bundleDirWithDefaults.destDir = _s.rtrim( bundleDirWithDefaults.destDir, "/" );
			return bundleDirWithDefaults;
		} );

		// apply the defaults to all viewDirs and add destination directory
		var viewAssetsDirCounter = 0;
		options.views = _.map( options.views, function( viewDir ) {
			var viewDirWithDefaults = _.extend( {}, kViewsDirDefaults, viewDir );
			viewDirWithDefaults.destDir = path.join( options.publicDir, kViewAssetsDirPrefix + viewAssetsDirCounter++ );
			if( _.isString( viewDirWithDefaults.viewFileExt ) ) viewDirWithDefaults.viewFileExt = [ viewDirWithDefaults.viewFileExt ];

			viewDirWithDefaults.path = _s.rtrim( viewDirWithDefaults.path, "/" );
			viewDirWithDefaults.destDir = _s.rtrim( viewDirWithDefaults.destDir, "/" );

			return viewDirWithDefaults;
		} );

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

		return options;
	}

	grunt.registerMultiTask( "cartero", "Your task description goes here.", function() {

		options = this.options();

		validateConfigOptions( options );

		options = applyDefaultsAndSanitize( options );

		var libraryAndViewDirs = _.union( options.library, options.views );
		var extToCopy = _.union( options.tmplExt, kValidImageExt, kJSandCSSExt );

		var assetExtensionMap = {};

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			assetExtensionMap[ preprocessingTask.inExt ] = preprocessingTask.outExt;
		} );

		//options.validOriginalAssetExt = _.union( _.keys( assetExtensionMap ), kJSandCSSExt, options.tmplExt );
		File.setAssetExtensions( _.union( _.keys( assetExtensionMap ), kJSandCSSExt, options.tmplExt ) );

		mode = options.mode;

		// For each supplied preprocessingTask, set up the task configuration:
		// - files : All files of the given inExt in all `views` and `library` directories
		// - options : Pass through options supplied in the processingTask
		_.each( options.preprocessingTasks, function( preprocessingTask ) {

			configureUserDefinedTask( libraryAndViewDirs, preprocessingTask, true, false );

		} );

		// For each supplied minificationTask, set up the task configuration
		_.each( options.minificationTasks, function( minificationTask ) {

			configureUserDefinedTask( libraryAndViewDirs, minificationTask, false, true );

		} );

		// Loop through the assets that don't require preprocessing and create/configure the target
		_.each( extToCopy, function ( ext ) {

			configureWatchTaskForJsCssTmpl( libraryAndViewDirs, ext, validCarteroDirExt );

		} );

		configureCarteroTask( "clean", { libraryAndViewDirs : libraryAndViewDirs } );
		configureCarteroTask( "prepare", { libraryAndViewDirs : libraryAndViewDirs } );
		configureCarteroTask( "copy", { libraryAndViewDirs : libraryAndViewDirs, extToCopy : extToCopy } );

		configureCarteroTask( "buildBundleAndParcelRegistries", { assetExtensionMap : assetExtensionMap } );


		var validCarteroDirExt = _.union( options.tmplExt, kJSandCSSExt );
		configureCarteroTask( "replaceCarteroDirTokens", { validCarteroDirExt : validCarteroDirExt, publicDir : options.publicDir } );

		configureWatchViewFile( options );
		configureWatchBundleJson( options );

		var cleanableAssetExt = _.union( options.tmplExt, kJSandCSSExt );
		configureCarteroTask( "cleanup", { cleanableAssetExt : cleanableAssetExt, publicDir : options.publicDir } );

		registerWatchTaskListener( libraryAndViewDirs, options.browserify, extToCopy, assetExtensionMap );

		configureCarteroBrowserifyTask( libraryAndViewDirs, options.projectDir );

		queueTasksToRun( options.mode, options.preprocessingTasks, options.minificationTasks, options.postProcessor );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "copy", "", function() {

		var taskConfig = this.options();

		var filesToCopy = [];

		_.each( taskConfig.libraryAndViewDirs, function ( dirOptions ) {

			filesToCopy = _.union( filesToCopy, grunt.file.expandMapping(
				_.map( taskConfig.extToCopy, function( extension ) {
					return "**/*" + extension;
				} ),
				dirOptions.destDir,
				{
					cwd : dirOptions.path
				}
			) );
		} );

		_.each( filesToCopy, function( fileSrcDest ) {
			grunt.file.copy( fileSrcDest.src, fileSrcDest.dest );
		} );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "replaceRelativeUrlsInCssFile", "", function() {

		var cssFiles = [];

		_.each( parcelRegistry, function( parcel ) {
			_.each( parcel.filesToServe, function( file ) {
				_.each( file.sourceFilePaths, function( filePath ) {
					if( _s.endsWith( filePath, ".css" ) )
						cssFiles.push( filePath );
				} );
			} );
		} );

		var done = this.async();

		async.each(
			cssFiles,
			function( file, callback ) {
				makeUrlsAbsoluteInCssFile( file, callback );
			},
			function( err ) {
				if( err ) {
					console.log( "Error while replacing relative URLs in CSS file with absolute ones: " + e );
					throw err;
				}

				done();
			}
		);
	} );

	grunt.registerTask( kCarteroTaskPrefix + "runPostProcessor", "", function() {
		options.postProcessor( parcelRegistry );
	} );

	grunt.registerTask( kCarteroTaskPrefix + "processViewFileChange", "", function() {
		rebundle();
	} );

	grunt.registerTask( kCarteroTaskPrefix + "processBundleJsonChange", "", function() {
		rebundle();
	} );

	// Creates the assetLibrary and appPages destination directories
	grunt.registerTask( kCarteroTaskPrefix + "prepare", "Prepare directories for build", function() {

		var taskConfig = this.options();
		_.each( taskConfig.libraryAndViewDirs, function ( dirOptions ) {
			grunt.file.mkdir( dirOptions.destDir );
		} );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "clean", "Clean output directories", function() {

		var taskConfig = this.options();
		_.each( taskConfig.libraryAndViewDirs, function ( dirOptions ) {
			grunt.file.delete( dirOptions.destDir );
		} );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "buildBundleAndParcelRegistries", "Build bundle and page map JSONs", function( mode ) {

		var opts = this.options();

		try {
			bundleRegistry = Bundle.createRegistry( options.library, mode, opts.assetExtensionMap );
		}
		catch( e ) {
			var errMsg = "Error while resolving bundles: " + e.stack;
			if( mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );

		}

		try {
			parcelRegistry = Parcel.createRegistry( options.views, bundleRegistry, mode, opts.assetExtensionMap );
		}
		catch( e ) {
			var errMsg = "Error while resolving pages: " + e.stack;
			if( mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}
	} );

	grunt.registerTask( kCarteroTaskPrefix + "buildCombinedFiles", "", function() {

		_.each( _.values( bundleRegistry ), function( bundle ) {
			bundle.buildCombinedFiles();
		} );

		_.each( _.values( parcelRegistry ), function( parcel ) {
			parcel.buildCombinedFiles();
		} );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "seperateFilesToServeByType", "", function() {
		_.each( _.values( parcelRegistry ), function( parcel ) {
			parcel.buildResourcesToLoad();
		} );
	} );

	// Figures out which asset files aren't referenced by the pageMap or bundleMap and removes them
	grunt.registerTask( kCarteroTaskPrefix + "cleanup", "", function() {

		var options = this.options();

		var referencedFiles = [];

		_.each( parcelRegistry, function( parcel ) {

			//var metadataForMode = parcel[ options.mode ];

			referencedFiles = _.union( referencedFiles, parcel.js, parcel.css, parcel.tmpl );

		} );

		_.each( _.values( bundleRegistry ), function( bundle ) {

			referencedFiles = _.union( referencedFiles, bundle.dynamicallyLoadedFiles );

		} );

		var filesToClean = grunt.file.expand( {
				filter : function( fileName ) {
					//cleaning assets that are not used by any page
					return ! _.contains( referencedFiles, fileName ) && _.contains( options.cleanableAssetExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
				}
			},
			[ options.publicDir + "/**/*" ]
		);

		_.each( filesToClean, function ( file ) {
			grunt.file.delete( file );
		} );

	} );

	// Saves the bundleMap and pageMap contents to files.
	grunt.registerTask( kCarteroTaskPrefix + "saveCarteroJson", "", function() {

		var parcelDataToSave = {};
		_.each( _.values( parcelRegistry ), function( parcel ) {
			parcelDataToSave[ parcel.path ] = {
				js : parcel.js || [],
				css : parcel.css || [],
				tmpl : parcel.tmpl || []
			};
		} );

		var carteroJson = {};

		carteroJson.publicDir = options.publicDir;
		carteroJson.parcels = parcelDataToSave;
		carteroJson.mode = options.mode;

		carteroUtil.saveCarteroJson( carteroJson, options.projectDir );

	} );

	grunt.registerTask( kCarteroTaskPrefix + "replaceCarteroDirTokens", "", function() {

		var options = this.options();
		function replaceStringInFile( fileName, matchString, replaceString, callback ) {

			async.waterfall( [
				function( callback ) {
					fs.readFile( fileName, function( err, data) {
						var fileContents = data.toString().replace( matchString, replaceString );
						callback( err, fileContents );
					} );
				},
				function( fileContents, callback ) {
					fs.writeFile( fileName, fileContents, callback );
				}
			],
			function( err ) {
				if( err ) {
					grunt.fail.warn( "Error while replacing ##cartero_dir tokens: " + err  );
				}
				callback( err );
			} );
		}

		function isValidCarteroDirFile( fileName ) {
			return _.contains( options.validCarteroDirExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
		}

		var done = this.async();

		var assetFiles = [];

		var finder = findit.find( options.publicDir );

		finder.on( "file", function( file, stat ) {
			if( isValidCarteroDirFile( file ) ) assetFiles.push( file );
		} );

		finder.on( "end", function() {
			async.each(
				assetFiles,
				function( fileName, callback ) {
					replaceStringInFile( fileName, /##cartero_dir/g, fileName.replace( options.publicDir + "/", "").replace(/\/[^\/]*$/, "" ), callback );
				},
				function( err ) {
					if( err ) {
						grunt.fail.warn( "Error while replacing ##cartero_dir tokens: " + err  );
					}
					done();
				}
			);
		} );
	} );

	grunt.registerMultiTask( kCarteroTaskPrefix + "browserify", "", function() {

		var browserifyExecuteOnLoadFiles = [];

		_.each( _.values( bundleRegistry ), function( bundle ) {
			browserifyExecuteOnLoadFiles = _.union( browserifyExecuteOnLoadFiles, bundle.browserifyExecuteOnLoad );
		} );

		function isAutorunFile( filePath, fileSrc ) {
			if( isViewsFile( filePath.replace( options.projectDir + path.sep, "") ) )
				return fileSrc.indexOf( kbrowserifyExecuteOnLoad ) != -1;
			else
				return _.contains( browserifyExecuteOnLoadFiles, filePath.replace( options.projectDir + path.sep, "" ) );
		}

		function processFile( filePath, filePathDest, cb ) {

			var b = browserify();

			var fileContents = fs.readFileSync( filePath ).toString();

			if( isAutorunFile( filePath, fileContents ) ) {
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
