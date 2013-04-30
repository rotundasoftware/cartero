/*
 * grunt-bundler
 * https://github.com/go-oleg/bundler
 *
 * Copyright (c) 2013 Oleg Seletsky
 * Licensed under the MIT license.
 */

var assetManager = require( "./../lib/assetManager.js" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" );

'use strict';

module.exports = function(grunt) {

	var assetBundlerTaskPrefix = "ASSET_BUNDLER";

	var kAssetFileExtensions = [ "**/*.js", "**/*.css", "**/*.tmpl" ];

	var kBundleMapJSONFile = "bundleMap.json";
	var kPageMapJSONFile = "pageMap.json";
	var kAssetBundlerDir = "assetBundler/";

	var compileAssetsMap = {
		coffee : {
			src : ".coffee",
			dest : ".js"
		},
		compass : {
			src : ".scss",
			dest : ".css"
		},
		less : {
			src : ".less",
			dest : ".css"
		},
		//jade?
		stylus : {
			src : ".styl",
			dest : ".css"
		}
	};

	var options = {};

	function resolveAssetFilePath( fileName ) {
		return fileName.replace( "{ASSET_LIBRARY}/", options.assetLibraryDest ).replace( "{APP_PAGES}/", options.appPagesDest );
	}

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

	grunt.registerTask( "testBundler", "", function() {

		grunt.log.writeln( JSON.stringify( this ) );

	} );

	grunt.registerMultiTask('bundler', 'Your task description goes here.', function() {

		options = this.options();

		var mode = options.mode;
		//console.log( "mode: " + mode );
		//grunt.log.writeln( JSON.stringify( options, null, "\t") );

		var copy = grunt.config( "copy" ) || {};
		var clean = grunt.config( "clean" ) || {};
		var watch = grunt.config( "watch" ) || {};
		var concat = grunt.config( "concat" ) || {};

		copy[ assetBundlerTaskPrefix ] = {
			files : [
				{
					src: kAssetFileExtensions,
					dest : options.assetLibraryDest,
					expand : true,
					cwd : options.assetLibrarySrc
				},
				{
					src: kAssetFileExtensions,
					dest : options.appPagesDest,
					expand : true,
					cwd : options.appPagesSrc
				}
			]
		};

		grunt.config( "copy", copy );

		clean[ assetBundlerTaskPrefix ] = [ options.assetLibraryDest , options.appPagesDest, kAssetBundlerDir ];

		clean[ assetBundlerTaskPrefix + "_js" ] = {
			src : "<%= filesToCleanJS %>"
		};

		clean[ assetBundlerTaskPrefix + "_css" ] = {
			src : "<%= filesToCleanCSS %>"
		};

		clean[ assetBundlerTaskPrefix + "_tmpl" ] = {
			src : "<%= filesToCleanTMPL %>"
		};

		grunt.config( "clean", clean );

		_.each( _.keys( compileAssetsMap ), function( taskName ) {

			var task = grunt.config( task ) || {};

			var taskOptions = compileAssetsMap[ taskName ];

			var userSpecifiedOptions;

			if( ! _.isUndefined( options.preprocessingOptions ) ) {
				userSpecifiedOptions = options.preprocessingOptions[ taskName ];
			}

			if( taskName === "compass" ) {

				if( _.isUndefined( userSpecifiedOptions ) ) userSpecifiedOptions = {};
				
				var assetLibraryOptions = _.extend( {}, {
					sassDir : options.assetLibrarySrc,
					cssDir : options.assetLibraryDest
				},
				userSpecifiedOptions );

				task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
					options : assetLibraryOptions
				};

				var appPagesOptions = _.extend( {}, {
					sassDir : options.appPagesSrc,
					cssDir : options.appPagesDest
				},
				userSpecifiedOptions );

				task[ assetBundlerTaskPrefix + "_appPages" ] = {
					options : appPagesOptions
				};

			}
			else {
				task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
						expand: true,
					cwd: options.assetLibrarySrc,
					src: [ "**/*" + taskOptions.src ],
					dest: options.assetLibraryDest,
					ext: taskOptions.dest
				};

				task[ assetBundlerTaskPrefix + "_appPages" ] = {
					expand: true,
					cwd: options.appPagesSrc,
					src: [ "**/*" + taskOptions.src ],
					dest: options.appPagesDest,
					ext: taskOptions.dest
				};

				if( ! _.isUndefined( userSpecifiedOptions ) ) {
					task[ assetBundlerTaskPrefix + "_assetLibrary" ].options = userSpecifiedOptions;
					task[ assetBundlerTaskPrefix + "_appPages" ].options = userSpecifiedOptions;
				}

			}

			grunt.config( taskName, task );

		} );

		_.each( options.minificationTasks, function( taskConfig ) {

			var task = grunt.config( taskConfig.name ) || {};

			//TODO: add support for multiple suffixes
			task[ assetBundlerTaskPrefix + "_assetLibrary" ] = {
				options : taskConfig.options,
				expand: true,
				cwd: options.assetLibraryDest,
				src: [ "**/*" + taskConfig.suffixes[0] ],
				rename: function(dest, src){ return dest + src; },
				dest: options.assetLibraryDest
				//ext: taskConfig.suffixes[0]
			};

			task[ assetBundlerTaskPrefix + "_appPages" ] = {
				options : taskConfig.options,
				expand: true,
				cwd: options.appPagesDest,
				src: [ "**/*" + taskConfig.suffixes[0] ],
				rename: function(dest, src){ return dest + src; },
				dest: options.appPagesDest
				//ext: taskConfig.suffixes[0]
			};

			grunt.config( taskConfig.name, task );

		} );

		concat[ assetBundlerTaskPrefix + "_js" ] = {
			src : "<%= filesToConcatJS %>",
			dest : "<%= concatedFileDestJS %>"
		};

		concat[ assetBundlerTaskPrefix + "_css" ] = {
			src : "<%= filesToConcatCSS %>",
			dest : "<%= concatedFileDestCSS %>"
		};

		concat[ assetBundlerTaskPrefix + "_tmpl" ] = {
			src : "<%= filesToConcatTMPL %>",
			dest : "<%= concatedFileDestTMPL %>"
		};

		grunt.config( "concat", concat );

		_.each( _.keys( compileAssetsMap ), function( taskName ) {

			var taskOptions = compileAssetsMap[ taskName ];

			watch[ assetBundlerTaskPrefix + "_assetLibrary_" + taskName ] = {
				files : [ options.assetLibrarySrc + "**/*" + taskOptions.src ],
				tasks : [ "processFileChange" ],
				options : {
					nospawn : true
				}
			};

			watch[ assetBundlerTaskPrefix + "_appPages_" + taskName ] = {
				files : [ options.appPagesSrc + "**/*" + taskOptions.src ],
				tasks : [ "processFileChange" ],
				options : {
					nospawn : true
				}
			};

		} );

		var assetFilesToWatch = _.map( kAssetFileExtensions, function( extension ) {
			return options.assetLibrarySrc + extension;
		} );

		assetFilesToWatch = _.union( assetFilesToWatch, _.map( kAssetFileExtensions, function( extension ) {
			return options.appPagesSrc + extension;
		} ) );

		watch[ assetBundlerTaskPrefix + "_copy" ] = {

			files : assetFilesToWatch,
			tasks : [ "processFileChange" ],
			options : {
				nospawn : true
			}

		};
/*
		var processFileChange = {};

		_.each( _.keys( compileAssetsMap ), function( taskName ) {
			processFileChange[ taskName ] = {
				options : {

				}
			};
		} );

		grunt.config( "processFileChange", processFileChange );
		*/
/*
		grunt.event.on( "watch", function(action, filepath) {
			grunt.log.writeln( "filepath: " + filepath);
			_.each( _.keys( compileAssetsMap ), function( taskName ) {

				var taskConfig = grunt.config( "processFileChange" );

				taskConfig[ taskName ] = {
					options : {
						srcFile : filepath
					}
				};

				grunt.config( "processFileChange", taskConfig );
				//grunt.config([ "processFileChange:" + taskName ], filepath);
			} );
		});
*/

		grunt.config( "watch", watch );

		grunt.task.run( "clean:ASSET_BUNDLER" );
		grunt.task.run( "prepare" );
		grunt.task.run( "copy" );

		_.each( _.keys( compileAssetsMap ), function( taskName ) {
			grunt.task.run( taskName + ":" + assetBundlerTaskPrefix + "_assetLibrary" );
			grunt.task.run( taskName + ":" + assetBundlerTaskPrefix + "_appPages" );
		} );

		grunt.task.run( "buildBundleAndPageJSONs:" + mode );

		if( mode === "prod" ) {
			grunt.task.run( "buildKeepSeparateBundles" );
			grunt.task.run( "buildPageBundles" );

			//TODO: only run the asset bundler targets
			_.each( options.minificationTasks, function( taskConfig ) {
				grunt.task.run( taskConfig.name );
			} );
		}

		grunt.task.run( "saveBundleAndPageJSONs" );

		grunt.log.writeln("options: " + JSON.stringify( grunt.config( "watch" ), null, "\t" ) );

		grunt.log.writeln("processFileChange: " + JSON.stringify( grunt.config( "processFileChange" ), null, "\t" ) );

		if( mode === "dev" ) {
			grunt.task.run( "watch" );
		}

	} );

	grunt.registerTask( "processFileChange", "", function() {


		grunt.task.run( "copy" );

		_.each( _.keys( compileAssetsMap ), function( taskName ) {
			grunt.task.run( taskName + ":" + assetBundlerTaskPrefix + "_assetLibrary" );
			grunt.task.run( taskName + ":" + assetBundlerTaskPrefix + "_appPages" );
		} );

		/*
		grunt.log.writeln("options: " + JSON.stringify( this.options(), null, "\t" ) );
		grunt.log.writeln("arguments: " + JSON.stringify( arguments, null, "\t" ) );

		var compileTaskName = this.target;

		var srcFile = options;

		var isAssetLibraryFile = srcFile.indexOf( options.assetLibrarySrc ) != -1;
		var destFile = srcFile.replace( options.assetLibrarySrc, options.assetLibraryDest ).replace( options.appPagesSrc, options.appPagesDest );

		//copy[ "processFileChange" ] = {
		//	files : [ {
		//		src : srcFile,
		//		dest : srcFile.replace( options.assetLibrarySrc, options.assetLibraryDest ).replace( options.appPagesSrc, options.appPagesDest )
		//	} ]
		//};

		var compileTask = grunt.config( compileTaskName );

		if( isAssetLibraryFile ) {

			compileTask[ "processFileChange" ] = {
				files : [ {
					src : srcFile,
					dest : destFile.replace( compileAssetsMap[ compileTaskName].src, compileAssetsMap[ compileTaskName].dest )
				} ]
			};

		}

		grunt.task.run( compileTask + ":processFileChange" );
*/
	} );

	grunt.registerTask( "prepare", "Prepare directories for build", function() {

		grunt.log.writeln( JSON.stringify( options, null, "\t") );
		grunt.file.mkdir( options.assetLibraryDest );
		grunt.file.mkdir( options.appPagesDest );

		var configOptions = {
			assetLibrarySrc : options.assetLibrarySrc,
			assetLibraryDest : options.assetLibraryDest,
			appPagesSrc : options.appPagesSrc,
			appPagesDest : options.appPagesDest,
			//bundlerRequireDirective : grunt.config.get( "bundlerRequireDirective" ),
			//bundlerExtendsDirective : grunt.config.get( "bundlerExtendsDirective" ),
			projectRootDir : __dirname,
			bundleMap : kAssetBundlerDir + kBundleMapJSONFile,
			pageMap : kAssetBundlerDir + kPageMapJSONFile
		};

		assetManager.saveBundlerConfig( configOptions );

		//grunt.file.write( kAssetBundlerDir + "config.json", JSON.stringify( configOptions, null, "\t" ) );

	} );

	grunt.registerTask( "buildBundleAndPageJSONs", "Build bundle and page map JSONs", function( mode ) {

		//var bundleMap = assetManager.buildBundlesMap( grunt.config.get( "tmpDir" ) + grunt.config.get( "assetLibrarySrc" ) );

		var bundleMap = assetManager.buildBundlesMap( options.assetLibrarySrc );

		try {
			assetManager.resolveBundlesMap( bundleMap, mode );
		}
		catch( e ) {
			grunt.fail.fatal(e, 1 );
		}

		grunt.config.set( "bundleMap", bundleMap );
		//grunt.file.write( kDependencyJSONFile, JSON.stringify( bundleMap , null, "\t" ) );

		//var templateMap = assetManager.buildTemplatesMap( grunt.config.get( "tmpDir" ) + grunt.config.get( "appPagesSrc" ) );
		var pageMap = assetManager.buildPagesMap( options.appPagesSrc );
		assetManager.resolvePagesMap( pageMap, mode );

		grunt.config.set( "pageMap", pageMap );
		//grunt.file.write( kTemplateMapJSONFile, JSON.stringify( templateMap , null, "\t" ) );

	} );

	grunt.registerTask( "buildKeepSeparateBundles", "Builds the keep separate bundle files.", function() {

		this.requires( "buildBundleAndPageJSONs:prod" );
		var bundleMap = grunt.config.get( "bundleMap" );
		var keepSeparateBundles = _.filter( _.values( bundleMap ), function( bundle ) {
			return bundle.keepSeparate;
		} );
		grunt.config.set( "keepSeparateBundles", keepSeparateBundles );
		grunt.task.run( "buildKeepSeparateBundlesHelper" );

	} );

	grunt.registerTask( "buildKeepSeparateBundlesHelper", "", function() {

		var keepSeparateBundles = grunt.config.get( "keepSeparateBundles" );
		if( keepSeparateBundles.length === 0 ) return;
		var bundle = keepSeparateBundles.pop();
		grunt.config.set( "keepSeparateBundles", keepSeparateBundles );

		var files = bundle.files;
		var filesToConcatCSS = [];
		var filesToConcatJS = [];
		var filesToConcatTMPL = [];

		_.each( files, function( file ) {
			if( _s.endsWith( file, ".css" ) )
				filesToConcatCSS.push( resolveAssetFilePath( file ) );
			else if ( _s.endsWith( file, ".js" ) )
				filesToConcatJS.push( resolveAssetFilePath( file ) );
			else if( _s.endsWith( file, ".tmpl" ) )
				filesToConcatTMPL.push( resolveAssetFilePath( file ) );
		} );

		grunt.config.set( "filesToConcatJS", filesToConcatJS );
		grunt.config.set( "filesToConcatCSS", filesToConcatCSS );
		grunt.config.set( "filesToConcatTMPL", filesToConcatTMPL );
		grunt.config.set( "concatedFileDestJS", options.assetLibraryDest + bundle.name.replace(/\//g,"_") + "_combined.js" );
		grunt.config.set( "concatedFileDestCSS", options.assetLibraryDest + bundle.name.replace(/\//g,"_") + "_combined.css" );
		grunt.config.set( "concatedFileDestTMPL", options.assetLibraryDest + bundle.name.replace(/\//g,"_") + "_combined.tmpl" );

		grunt.config.set( "filesToCleanJS", filesToConcatJS );
		grunt.config.set( "filesToCleanCSS", filesToConcatCSS );
		grunt.config.set( "filesToCleanTMPL", filesToConcatTMPL );

		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_js" );
		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_css" );
		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_tmpl" );

		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_js" );
		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_css" );
		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_tmpl" );
		grunt.task.run( "buildKeepSeparateBundlesHelper" );

	} );

	grunt.registerTask( "buildPageBundles", "Builds the bundles for each page", function() {

		this.requires( "buildBundleAndPageJSONs:prod" );

		var pageMap = grunt.config.get( "pageMap" );
		grunt.config.set( "pages", _.keys( pageMap ) );
		grunt.task.run( "buildPageBundlesHelper" );
	} );

	grunt.registerTask( "buildPageBundlesHelper", "", function() {

		var pages = grunt.config.get( "pages" );
		var pageMap = grunt.config.get( "pageMap" );
		var bundleMap = grunt.config.get( "bundleMap" );

		if( pages.length === 0 ) return;

		var pageMetadata = pageMap[ pages.pop() ];

		grunt.config.set( "pages", pages );

		var pageDir = pageMetadata.name.replace(/\/[^\/]*$/,"/");
		var pageName = pageMetadata.name.substring( pageMetadata.name.lastIndexOf( "/" ) + 1);

		var files = [];

		var bundlesIncorporatedIntoCombined = [];

		var filesAlreadyInKeepSeparate = [];

		_.each( pageMetadata.requiredBundles, function( bundleName ) {

			var bundle = bundleMap[ bundleName ];

			if( ! bundle.keepSeparate ) {
				files = _.union( files, _.map( bundle.files, function( file ) {
					//return "{ASSET_LIBRARY}/" + file;
					return resolveAssetFilePath( file );
				} ) );
				bundlesIncorporatedIntoCombined.push( bundleName );
			}
			else {
				filesAlreadyInKeepSeparate = _.union( filesAlreadyInKeepSeparate, _.map( bundle.files, function( file ) {
					return resolveAssetFilePath( file );
				} ) );
			}

		} );

		files = _.difference( files, filesAlreadyInKeepSeparate );

		files = _.union( files, _.map( pageMetadata.files, function( file ) {

			//return "{APP_PAGES}/" + file;
			return resolveAssetFilePath( file );

		} ) );

		var filesToConcatCSS = [];
		var filesToConcatJS = [];
		var filesToConcatTMPL = [];

		//grunt.log.writeln( "concatenating files: " + files.join(", ") );

		_.each( files, function( file ) {

			//var realFileName = file.replace( "{APP_PAGES}/", grunt.config.get( "appPagesDest") ).replace( "{ASSET_LIBRARY}/", grunt.config.get( "assetLibraryDest") );
			var realFileName = resolveAssetFilePath( file );

			//grunt.log.writeln( "realFileName: " + realFileName );
			if( _s.endsWith( file, ".css" ) )
				filesToConcatCSS.push( realFileName );
			else if ( _s.endsWith( file, ".js" ) )
				filesToConcatJS.push( realFileName );
			else if( _s.endsWith( file, ".tmpl" ) )
				filesToConcatTMPL.push( realFileName );
		} );

		var combinedPagePrefix = pageDir + pageName + "_combined";
		var combinedPagePrefixForPageMap = "{APP_PAGES}/" + combinedPagePrefix;

		pageMetadata.files = [ combinedPagePrefixForPageMap + ".js", combinedPagePrefixForPageMap + ".css", combinedPagePrefixForPageMap + ".tmpl" ];

		pageMetadata.requiredBundles = _.difference( pageMetadata.requiredBundles, bundlesIncorporatedIntoCombined );

		grunt.config.set( "filesToConcatJS", filesToConcatJS );
		grunt.config.set( "filesToConcatCSS", filesToConcatCSS );
		grunt.config.set( "filesToConcatTMPL", filesToConcatTMPL );

		grunt.config.set( "filesToCleanJS", filesToConcatJS );
		grunt.config.set( "filesToCleanCSS", filesToConcatCSS );
		grunt.config.set( "filesToCleanTMPL", filesToConcatTMPL );

		grunt.config.set( "concatedFileDestJS", options.appPagesDest + combinedPagePrefix + ".js" );
		grunt.config.set( "concatedFileDestCSS", options.appPagesDest + combinedPagePrefix + ".css" );
		grunt.config.set( "concatedFileDestTMPL", options.appPagesDest + combinedPagePrefix + ".tmpl" );

		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_js" );
		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_css" );
		grunt.task.run( "concat:" + assetBundlerTaskPrefix + "_tmpl" );

		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_js" );
		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_css" );
		grunt.task.run( "clean:" + assetBundlerTaskPrefix + "_tmpl" );

		grunt.task.run( "buildPageBundlesHelper" );

		grunt.config.set( "pageMap", pageMap );

	} );

	grunt.registerTask( "saveBundleAndPageJSONs", "Persist the page and bundle JSONs", function() {

		//grunt.file.write( kAssetBundlerDir + kBundleMapJSONFile, JSON.stringify( grunt.config.get( "bundleMap" ) , null, "\t" ) );
		assetManager.saveBundleMap( grunt.config.get( "bundleMap" ) );
		assetManager.savePageMap( grunt.config.get( "pageMap" ) );
		//grunt.file.write( kAssetBundlerDir + kPageMapJSONFile, JSON.stringify( grunt.config.get( "pageMap" ), null, "\t") );

	} );

};
