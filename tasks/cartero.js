/*
 * Cartero v0.1.0
 * https://github.com/rotundasoftware/cartero
 *
 * Copyright (c) 2013 Rotunda Software, LLC
 * Licensed under the MIT license.
 */

var	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	fs = require( "fs" ),
	findit = require( "findit" ),
	path = require( "path" ),
	detective = require( "detective" ),
	resolve = require( "resolve" ),
	browserify = require( "browserify" ),
	async = require( "async" ),
	Bundle = require( "./../lib/bundle" ),
	Parcel = require( "./../lib/parcel" ),
	File = require( "./../lib/file" );

'use strict';

module.exports = function(grunt) {

	// Prefix for all task targets added by cartero to avoid conflicts with already existing targets.
	var kCarteroTaskPrefix = "cartero_";
	var kCarteroJsonFile = "cartero.json";

	var kBundleJsonFile = "bundle.json";

	var kLibraryAssetsDirPrefix = "library-assets";
	var kViewAssetsDirPrefix = "view-assets";

	var kRequiredConfigOptions = [ "mode", "projectDir", "publicDir", "views" ];
	var kRequiredLibraryConfigOptions = [ "path" ];
	var kRequiredViewsConfigOptions = [ "path", "viewFileExt" ];

	// cartero directive: When browserify is enabled, this directive is used in js files in views that should be automatically run upon loading.
	var kBrowserifyExecuteOnLoad = "##cartero_browserify_executeOnLoad";

	// Default values for the views task option.
	var kViewsDirDefaults = {
		directoriesToFlatten : /^_.*/
	};

	// Default values for the library task option.
	var kLibraryDirDefaults = {
		allowNestedBundles : true,
		childrenDependOnParents : true,
		directoriesToFlatten : /^_.*/
	};

	// Global default values
	var kOptionsDefaults = {
		browserify : false,
		tmplExt : []
	};

	var kValidImageExts = [ ".jpg", ".png", ".gif", ".bmp", ".jpeg" ];

	// Will contain options passed into the cartero task with defaults applied.
	var options = {};

	var bundleRegistry = {};
	var parcelRegistry = {};

	// Files that are browserified and need to be run upon loading.
	var browserifyExecuteOnLoadFiles = [];

	// Processes a CSS file looking for url().  Replaces relative paths with absolute ones ( to the staticDir ).
	function makeUrlsAbsoluteInCssFile( fileName, callback ) {
		fs.readFile( fileName, function( err, data ) {
			var fileContents = data.toString().replace( /url\(\s*?[\"\']?\s*?([^)]+)\s*?[\"\']?\s*?\)/g, function( match, url ) {
				url = url.trim();

				// we don't support absolute URLs for now
				if( url[0] === "/" ) return match;

				var pathRelativeToProjectDir = fileName.replace(/\/[^\/]*$/,"/") + path.sep + url;

				// sanity check: make sure url() contains a file path
				if( fs.existsSync( pathRelativeToProjectDir ) ) {
					return "url(" + "/" + path.relative( options.publicDir, pathRelativeToProjectDir ) + ")";
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
			return _s.startsWith( fileName, dirOptions.path ) && _.contains( dirOptions.viewFileExt, File.getFileExtension( fileName ) );
		} );

		return ! _.isUndefined( viewFile );
	}

	// returns true if the given fileName is in a `views` directory
	function fileIsInPublicViewDirectory( fileName ) {
		var result = _.find( options.views, function( dirOptions ) {
			return _s.startsWith( fileName, dirOptions.destDir );
		} );

		return ! _.isUndefined( result );
	}

	function configureCarteroBrowserifyTask( libraryAndViewDirs, projectDir ) {

		var carteroBrowserify = grunt.config( kCarteroTaskPrefix + "browserify" ) || {};

		var browserifyFiles = _.map( libraryAndViewDirs, function( dirOptions ) {
			return {
				cwd : dirOptions.destDir,
				src : [ "**/*.js" ],
				dest : dirOptions.destDir,
				expand : true,
				filter : function( filePath ) {

					return ! _.isUndefined( File.getFromRegistryByPath( filePath ) );
				}
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
		var watch = grunt.config( "watch" ) || {};

		_.each( libraryAndViewDirs, function( dir ) {
			var taskTarget = kCarteroTaskPrefix + dir.path;

			var files = [ {
				expand: true,
				cwd: sourceIsDest ? dir.destDir : dir.path,
				src: [ "**/*" + taskConfig.inExt ],
				dest: dir.destDir,
				ext: taskConfig.outExt
			} ];

			task[ taskTarget ] = {
				files : files
			};

			if( ! _.isUndefined( taskConfig.options ) ) {
				if( _.isFunction( taskConfig.options ) )
					task[ taskTarget ].options = taskConfig.options( { srcDir : dir.path, destDir : dir.destDir } );
				else
					task[ taskTarget ].options = taskConfig.options;
			}

			if( doWatch && options.watch ) {
				watch[ kCarteroTaskPrefix + taskName + "_" + taskTarget ] = {
					files : [ dir.path + "/**/*" + taskConfig.inExt ],
					tasks : [],
					options : {
						nospawn : true
					}
				};
			}
		} );

		grunt.config( taskName, task );

		if( doWatch && options.watch ) {
			grunt.config( "watch", watch );
		}
	}

	function registerWatchTaskListener( libraryAndViewDirs, browserify, extToCopy, assetExtensionMap, validCarteroDirExt ) {
		grunt.event.on( "watch", function( action, filePath ) {
			var needToRebundle = action === "added" || action === "deleted" || isViewFile( filePath ) || _s.endsWith( filePath, kBundleJsonFile );
			// If its a new file, deleted file, viewFile, or a bundle.json file, need to rebuild all bundles.
			if( needToRebundle ) {
				File.clearRegistry();
				buildBundleRegistry();
				buildParcelRegistry();
				copyBundlesAndParcels();
				mapAssetFileNamesInBundles( assetExtensionMap );
				configureCarteroTask( "replaceCarteroDirTokens", { validCarteroDirExt : validCarteroDirExt, publicDir : options.publicDir } );
				grunt.task.run( kCarteroTaskPrefix + "replaceCarteroDirTokens" );
				_.each( options.preprocessingTasks, function( preprocessingTask ) {
					configureUserDefinedTask( libraryAndViewDirs, preprocessingTask, true, true );
				} );
				_.each( options.preprocessingTasks, function( preprocessingTask ) {
					grunt.task.run( preprocessingTask.name );
				} );
				configureCarteroBrowserifyTask( libraryAndViewDirs, options.projectDir );
				if( options.browserify ) grunt.task.run( kCarteroTaskPrefix + "browserify" );
				grunt.task.run( kCarteroTaskPrefix + "populateFilesToServe:dev" );
				grunt.task.run( kCarteroTaskPrefix + "separateFilesToServeByType:dev" );
				grunt.task.run( kCarteroTaskPrefix + "saveCarteroJson" );
			}
			else {
				var srcPath;
				var newDest;

				var dirOptions = _.find( libraryAndViewDirs, function( dirOptions ) {
					return filePath.indexOf( dirOptions.path ) === 0;
				} );

				var file = File.getFromRegistry( filePath );

				if( ! _.isUndefined( file ) ) {
					file.copy( dirOptions.path, dirOptions.destDir, true );
					srcPath = file.path;
					
				}
				else {
					srcPath = [];
					newDest = null;
				}

				if( validCarteroDirExt.indexOf( path.extname( newDest ) ) ) {
					configureCarteroTask( "replaceCarteroDirTokens", { fileName : file.path } );
					grunt.task.run( kCarteroTaskPrefix + "replaceCarteroDirTokens" );
				}

				// mapping the asset file name needs to be done after ##cartero_dir token replacement
				// since the files have not been copied but not processed (still have their old extension)
				if( ! _.isUndefined( file ) ) {
					newDest = file.path = File.mapAssetFileName( file.path, assetExtensionMap );
				}

				_.each( options.preprocessingTasks, function( preprocessingTask ) {

					var taskName = preprocessingTask.name;

					// If the changed file's extension matches the task, set the file.
					if( _s.endsWith( filePath, preprocessingTask.inExt ) ) {
						grunt.config( [ taskName, kCarteroTaskPrefix + dirOptions.path, "src" ], srcPath );
						grunt.config( [ taskName, kCarteroTaskPrefix  + dirOptions.path, "dest" ], newDest );
						grunt.task.run( taskName + ":" + kCarteroTaskPrefix  + dirOptions.path );
					}

				} );

				if( options.browserify ) {
					if( newDest !== null && _s.endsWith( newDest, ".js" ) ) {
						grunt.config( [ kCarteroTaskPrefix + "browserify", "default", "files" ], [ {
							src : newDest,
							dest : newDest
						} ] );
						grunt.task.run( kCarteroTaskPrefix + "browserify" );
					}
				}
			}
		} );
	}

	function configureWatchTaskForJsCssTmpl( libraryAndViewDirs, ext, validCarteroDirExt ) {
		var watch = grunt.config( "watch" ) || {};

		watch[ kCarteroTaskPrefix + ext ] = {
			files : _.map(
						// filter out any extensions that are already watched because they are a viewFile
						_.filter( libraryAndViewDirs, function( dir ) {
							if( ! _.isUndefined( dir.viewFileExt ) ) {
								return ! _.contains( dir.viewFileExt, ext );
							}
							else {
								return true;
							}
						} ), function ( dir ) {
							return dir.path + "/**/*" + ext;
			} ),
			tasks : [],
			options : {
				nospawn : true
			}
		};

		grunt.config( "watch", watch );
	}

	function queueTasksToRun( mode, preprocessingTasks, minificationTasks, postProcessor ) {


		// Builds the bundle registry
		grunt.task.run( kCarteroTaskPrefix + "buildBundleRegistry:" + mode );

		// Builds the parcelRegistry
		grunt.task.run( kCarteroTaskPrefix + "buildParcelRegistry:" + mode );

		grunt.task.run( kCarteroTaskPrefix + "clean" );
		grunt.task.run( kCarteroTaskPrefix + "prepare" );
		grunt.task.run( kCarteroTaskPrefix + "copy" );
		grunt.task.run( kCarteroTaskPrefix + "replaceCarteroDirTokens" );

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			grunt.task.run( preprocessingTask.name );
		} );

		grunt.task.run( kCarteroTaskPrefix + "mapAssetFileNamesInBundles" );

		// When in prod mode, need to replace relative URLs in CSS files with absolute ones because CSS file location
		// may change due to bundling.  This needs to happen before files are concatentated in buildParcelRegistry in prod mode.
		if( mode === "prod" ) {
			grunt.task.run( kCarteroTaskPrefix + "replaceRelativeUrlsInCssFile" );
		}

		if( options.browserify ) grunt.task.run( kCarteroTaskPrefix + "browserify" );

		grunt.task.run( kCarteroTaskPrefix + "populateFilesToServe:" + mode );

		grunt.task.run( kCarteroTaskPrefix + "separateFilesToServeByType" );

		// undocumented hook to do custom post processing
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
		if( mode === "dev" && options.watch ) {
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
			tasks : [],
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
			files : _.map( options.library, function ( dir ) {
					return dir.path + "/**/" + kBundleJsonFile;
				} ),
			tasks : [],
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

		if( options.library && ! _.isArray( options.library ) )
			options.library = [ options.library ];

		if( options.views &&  ! _.isArray( options.views ) )
			options.views = [ options.views ];

		if( options.tmplExt && ! _.isArray( options.tmplExt ) )
			options.tmplExt = [ options.tmplExt ];

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

	function applyDefaultsAndNormalize( options ) {
		options.projectDir = _s.rtrim( options.projectDir, "/" );
		options.publicDir = _s.rtrim( options.publicDir, "/" );
		options.library = options.library || [];

		options.watch = ! _.isUndefined( grunt.option( "watch" ) );

		// apply the defaults to all bundleDirs and add the destination directory
		options.library = _.map( options.library, function( bundleDir ) {
			var libraryDirWithDefaults = _.extend( {}, kLibraryDirDefaults, bundleDir );

			if( ! _.isUndefined( libraryDirWithDefaults.namespace ) )
				libraryDirWithDefaults.destDir = path.join( options.publicDir, kLibraryAssetsDirPrefix + "-" + libraryDirWithDefaults.namespace );
			else
				libraryDirWithDefaults.destDir = path.join( options.publicDir, kLibraryAssetsDirPrefix );
			libraryDirWithDefaults.path = _s.rtrim( libraryDirWithDefaults.path, "/" );
			libraryDirWithDefaults.destDir = _s.rtrim( libraryDirWithDefaults.destDir, "/" );
			return libraryDirWithDefaults;
		} );

		// apply the defaults to all viewDirs and add destination directory
		var viewAssetsDirCounter = 0;
		var numViewDirs = options.views.length;
		options.views = _.map( options.views, function( viewDir ) {
			var viewDirWithDefaults = _.extend( {}, kViewsDirDefaults, viewDir );
			var destDir;
			if( numViewDirs === 1 )
				destDir = path.join( options.publicDir, kViewAssetsDirPrefix );
			else
				destDir = path.join( options.publicDir, kViewAssetsDirPrefix + "-" + viewAssetsDirCounter++ );
			viewDirWithDefaults.destDir = destDir;

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

		return options;
	}

	function buildBundleRegistry() {
		try {
			bundleRegistry = Bundle.createRegistry( options.library, options.mode );
		}
		catch( e ) {
			var errMsg = "Error while resolving bundles: " + e.stack;
			if( options.mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}
	}

	function copyBundlesAndParcels() {
		_.each( bundleRegistry, function( bundle ) {
			bundle.copy();
		} );

		_.each( parcelRegistry, function( parcel ) {
			parcel.copy();
		} );
	}

	function buildParcelRegistry() {
		try {
			parcelRegistry = Parcel.createRegistry( options.views, bundleRegistry, options.mode );
		}
		catch( e ) {
			var errMsg = "Error while resolving pages: " + e.stack;
			if( options.mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}
	}

	function populateFilesToServe() {
		try {
			Parcel.populateFilesToServe( parcelRegistry, options.mode );
		}
		catch( e ) {
			var errMsg = "Error while resolving pages: " + e.stack;
			if( options.mode === "dev" )
				grunt.fail.warn( errMsg );
			else
				grunt.fail.fatal( errMsg );
		}
	}

	function mapAssetFileName( file, assetExtensionMap ) {
		file.path = File.mapAssetFileName( file.path, assetExtensionMap );
	}

	function mapAssetFileNamesInBundles( assetExtensionMap ) {
		_.each( bundleRegistry, function( bundle ) {
			_.each( bundle.files, function( file ) {
				mapAssetFileName( file, assetExtensionMap );
			} );
		} );

		_.each( parcelRegistry, function( parcel ) {
			_.each( parcel.files, function( file ) {
				mapAssetFileName( file, assetExtensionMap );
			} );
		} );

		File.rebuildRegistries();
	}

	grunt.registerMultiTask( "cartero", "Cartero asset manager.", function() {
		options = this.options();

		validateConfigOptions( options );
		options = applyDefaultsAndNormalize( options );

		var processedAssetExts = _.union( options.tmplExt, [ ".js", ".css" ] );

		var libraryAndViewDirs = _.union( options.library, options.views );
		var extToCopy = _.union( kValidImageExts, processedAssetExts );

		var assetExtensionMap = {};

		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			assetExtensionMap[ preprocessingTask.inExt ] = preprocessingTask.outExt;
		} );

		File.setAssetExtensions( _.union( _.keys( assetExtensionMap ), processedAssetExts, kValidImageExts ) );
		File.setTmplExtensions( options.tmplExt );

		// For each supplied preprocessingTask, set up the task configuration:
		// - files : All files of the given inExt in all `views` and `library` directories
		// - options : Pass through options supplied in the processingTask
		_.each( options.preprocessingTasks, function( preprocessingTask ) {
			configureUserDefinedTask( libraryAndViewDirs, preprocessingTask, true, true );
		} );

		// For each supplied minificationTask, set up the task configuration
		_.each( options.minificationTasks, function( minificationTask ) {
			configureUserDefinedTask( libraryAndViewDirs, minificationTask, false, true );
		} );

		configureCarteroTask( "clean", { libraryAndViewDirs : libraryAndViewDirs } );
		configureCarteroTask( "prepare", { libraryAndViewDirs : libraryAndViewDirs } );
		configureCarteroTask( "copy", { libraryAndViewDirs : libraryAndViewDirs, extToCopy : extToCopy } );

		//configureCarteroTask( "buildBundleRegistry", { assetExtensionMap : assetExtensionMap } );

		//configureCarteroTask( "buildParcelRegistry", { assetExtensionMap : assetExtensionMap } );
		configureCarteroTask( "mapAssetFileNamesInBundles", { assetExtensionMap : assetExtensionMap } );

		configureCarteroTask( "replaceRelativeUrlsInCssFile", { libraryAndViewDirs : libraryAndViewDirs } );

		var validCarteroDirExt = processedAssetExts.concat( [ ".scss", ".sass", ".coffee" ] );
		configureCarteroTask( "replaceCarteroDirTokens", { validCarteroDirExt : validCarteroDirExt, publicDir : options.publicDir } );

		// Loop through the assets that don't require preprocessing and create/configure the target
		if( options.watch ) {
			_.each( extToCopy, function ( ext ) {
				configureWatchTaskForJsCssTmpl( libraryAndViewDirs, ext, validCarteroDirExt );
			} );

			configureWatchViewFile( options );
			configureWatchBundleJson( options );
		}

		var cleanableAssetExt = _.union( processedAssetExts, _.pluck( options.preprocessingTasks, "inExt" ) );
		configureCarteroTask( "cleanup", { cleanableAssetExt : cleanableAssetExt, publicDir : options.publicDir } );

		registerWatchTaskListener( libraryAndViewDirs, options.browserify, extToCopy, assetExtensionMap, validCarteroDirExt );

		configureCarteroBrowserifyTask( libraryAndViewDirs, options.projectDir );

		queueTasksToRun( options.mode, options.preprocessingTasks, options.minificationTasks, options.postProcessor );
	} );

	grunt.registerTask( kCarteroTaskPrefix + "copy", "", function() {
		copyBundlesAndParcels();
	} );

	grunt.registerTask( kCarteroTaskPrefix + "replaceRelativeUrlsInCssFile", "", function() {
		var cssFiles = [];
		var done = this.async();
		var opts = this.options();

		_.each( opts.libraryAndViewDirs, function( dirOptions ) {
			cssFiles = _.union( cssFiles, _.filter( findit.sync( dirOptions.destDir ), function( file ) {
				return File.getFileExtension( file ) === ".css";
			} ) );
		} );

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

	grunt.registerTask( kCarteroTaskPrefix + "buildBundleRegistry", "Build bundle registry.", function() {
		buildBundleRegistry();
	} );

	grunt.registerTask( kCarteroTaskPrefix + "buildParcelRegistry", "Build parcel registry", function() {
		buildParcelRegistry();
	} );

	grunt.registerTask( kCarteroTaskPrefix + "mapAssetFileNamesInBundles", "", function() {
		mapAssetFileNamesInBundles( this.options().assetExtensionMap );
	} );

	grunt.registerTask( kCarteroTaskPrefix + "populateFilesToServe", "Populates the files to serve", function( mode ) {
		populateFilesToServe();
	} );

	grunt.registerTask( kCarteroTaskPrefix + "separateFilesToServeByType", "", function() {
		_.each( _.values( parcelRegistry ), function( parcel ) {
			parcel.separateFilesToServeByType();
		} );
	} );

	// Figures out which asset files aren't referenced by the pageMap or bundleMap and removes them
	grunt.registerTask( kCarteroTaskPrefix + "cleanup", "", function() {
		var options = this.options();
		var referencedFiles = [];

		_.each( parcelRegistry, function( parcel ) {
			referencedFiles = _.union( referencedFiles, parcel.js, parcel.css, parcel.tmpl );
		} );

		_.each( _.values( bundleRegistry ), function( bundle ) {
			referencedFiles = _.union( referencedFiles, _.pluck( _.filter( bundle.files, function( file ) {
				return file.isDynamicallyLoaded;
			} ), "path" ) );
		} );

		var filesToClean = grunt.file.expand( {
				filter : function( fileName ) {
					//cleaning assets that are not used by any page
					return ! _.contains( referencedFiles, fileName ) && _.contains( options.cleanableAssetExt, File.getFileExtension( fileName ) );
				}
			},
			[ options.publicDir + "/**" ]
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

		fs.writeFileSync( path.join( options.projectDir, kCarteroJsonFile ), JSON.stringify( carteroJson, null, "\t" ) );
	} );

	grunt.registerTask( kCarteroTaskPrefix + "replaceCarteroDirTokens", "", function() {
		var taskOptions = this.options();

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
			return _.contains( taskOptions.validCarteroDirExt, File.getFileExtension( fileName ) );
		}

		var done = this.async();

		if( ! _.isUndefined( taskOptions.fileName ) ) {
			replaceStringInFile( taskOptions.fileName,
				/##cartero_dir/g,
				taskOptions.fileName.replace( options.publicDir + "/", "").replace(/\/[^\/]*$/, "" ),
				function( err ) {
					if( err ) {
						grunt.fail.warn( "Error while replacing ##cartero_dir tokens: " + err  );
					}
					done();
				});
		}
		else {
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
		}
	} );

	grunt.registerMultiTask( kCarteroTaskPrefix + "browserify", "", function() {
		var browserifyExecuteOnLoadFiles = [];

		var filesToBundle = [];

		_.each( _.values( bundleRegistry ), function( bundle ) {
			browserifyExecuteOnLoadFiles = _.union( browserifyExecuteOnLoadFiles,
				_.pluck(
					_.filter( bundle.files, function( file ) {
						return file.isBrowserify_executeOnLoad;
					} ),
					"path" )
				);
		} );

		function isAutorunFile( filePath, fileSrc ) {
			if( fileIsInPublicViewDirectory( path.relative( options.projectDir, filePath ) ) ) {
				// Need to check the original file in case the ##cartero_browserify_executeOnLoad directive
				// was removed because comments were stripped during processing or for some other reason.
				var file = File.getFromRegistryByPath( path.relative( options.projectDir, filePath ) );
				var fileContents = fs.readFileSync( file.src ).toString();
				return fileContents.indexOf( kBrowserifyExecuteOnLoad ) != -1;
			}
			else
				return _.contains( browserifyExecuteOnLoadFiles, path.relative( options.projectDir, filePath ) );
		}

		function processFile( filePath, filePathDest, cb ) {

			var b = browserify();
			var requiredFiles;
			var fileContents = fs.readFileSync( filePath ).toString();

			if( isAutorunFile( filePath, fileContents ) ) {
				b.add( filePath );
			}

			b.require( filePath );

			try {
				requiredFiles = detective( fileContents );
			}
			catch( e ) {
				var errMsg =  "Failed to parse file " + filePath + ": " + e ;
				grunt.fail.warn( errMsg );
				cb();
				return;
			}

			var resolvedRequiredFiles = [];

			var hasBadRequire = false;
			var badRequire;
			var badResolvedRequire;

			_.each( requiredFiles, function( relativeRequire ) {
				var resolvedRequire = "";
				var fileDir = filePath.substring( 0, filePath.lastIndexOf( "/" ) );
				if( ! /^\w/.test( relativeRequire ) ) {
					resolvedRequire = path.resolve( fileDir, relativeRequire );
				}
				else {
					var firstDirInBundleName = relativeRequire.substring( 0, relativeRequire.indexOf( "/" ) );

					if( fs.existsSync( path.join( options.publicDir, kLibraryAssetsDirPrefix + "-" + firstDirInBundleName ) ) ) {
						resolvedRequire = path.join( options.projectDir, options.publicDir, kLibraryAssetsDirPrefix + "-" + firstDirInBundleName, relativeRequire.substring( relativeRequire.indexOf( "/" ) + 1 ) );
					}
					else {
						resolvedRequire = path.join( options.projectDir, options.publicDir, kLibraryAssetsDirPrefix, relativeRequire );
					}

					if( fs.existsSync( resolvedRequire ) ) {
						var stat = fs.statSync( resolvedRequire );

						if( stat.isDirectory() ) {

							var bundle = _.find( _.values( bundleRegistry ), function( bundleMetadata ) {
								return path.relative( options.projectDir, resolvedRequire) === bundleMetadata.directory;
							} );

							if( _.isUndefined( bundle ) ) {
								console.log( "Could not find bundle for resolved 'require': " + resolvedRequire );
							}

							//if( fs.existsSync( path.join( resolvedRequire, "package.json" ) ) ) {
							if( ! _.isUndefined( bundle.packageJson ) ) {
								var pkgJSON = bundle.packageJson;

								if( ! _.isUndefined( pkgJSON.main ) ) {
									resolvedRequire = path.join( resolvedRequire, pkgJSON.main );
								}
								else {
									resolvedRequire = path.join( resolvedRequire, "index.js" );
								}
							}
							else {
								resolvedRequire = path.join( resolvedRequire, "index.js" );
							}
						}
					}

					resolvedRequire = resolvedRequire.replace( /.js$/,"" ) + ".js";
		
					if( ! fs.existsSync( resolvedRequire ) ) {
						hasBadRequire = true;
						badRequire = relativeRequire;
						badResolvedRequire = resolvedRequire;
					}
				}

				resolvedRequiredFiles.push( resolvedRequire );
				fileContents = fileContents.replace(  new RegExp( "[\"']" + relativeRequire + "[\"']", "g" ),  "\"" + resolvedRequire + "\"" );

				b.external( resolvedRequire );
			} );

			if( hasBadRequire ) {
				console.log( "The 'require' path '" + badRequire + "' (resolved to '" + badResolvedRequire + "') in file '" + File.getFromRegistryByPath( filePathDest ).src + "' doesn't exist. Not browserifying this file since it would fail." );
				cb();
				return;
			}

			fs.writeFileSync( filePath, fileContents );

			filesToBundle.push( {
				browserify : b,
				filePath : filePath,
				filePathDest : filePathDest,
				requiredFiles : resolvedRequiredFiles
			} );


			cb();
		}

		var done = this.async();

		async.each(
			this.files,
			function( file, callback ) {
				var realPath = path.join( options.projectDir, file.src[ 0 ] );
				processFile( realPath , file.dest, callback );
			},
			function( err ) {
				if( err !== null ) {
					var errMsg = "An error occured while building browserify bundle information: " + err;
					grunt.fail.warn( errMsg );
				}

				async.eachSeries(
					filesToBundle,
					function( fileBundleInfo, callback ) {

						fileBundleInfo.browserify.bundle( { filter : function( fileName ) {
								return _.contains( fileBundleInfo.requiredFiles, fileName );
							}
						},
						function( err, src ) {
							if( err ) {
								var errMsg =  "Error while browserifying " + fileBundleInfo.filePath + " : " +  err;
								grunt.fail.warn( errMsg );
							}
							else {
								fs.writeFileSync( fileBundleInfo.filePathDest, src.toString() );
							}
							callback();
						} );
					},
					function( err ) {
						done();
					}
				);
			}
		);
	} );
};
