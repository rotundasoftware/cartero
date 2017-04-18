var _ = require( 'underscore' );
var fs = require( 'fs' );
var url = require( 'url' );
var path = require( 'path' );
var rimraf = require( 'rimraf' );
var async = require( 'async' );
var os = require( 'os' );
var tmpdir = (os.tmpdir || os.tmpDir)();
var EventEmitter = require( 'events' ).EventEmitter;
var inherits = require( 'inherits' );
var crypto = require( 'crypto' );
var mkdirp = require( 'mkdirp' );
var concat = require( 'concat-stream' );
var through2 = require('through2');
var combine = require( 'stream-combiner' );
var resolve = require( 'resolve' );
var replaceStringTransform = require( 'replace-string-transform' );
var globwatcher = require( 'globwatcher' ).globwatcher;
var Parcel = require( 'parcelify/lib/parcel.js' );
var log = require( 'npmlog' );
var factor = require( 'factor-bundle' );
var glob = require( 'glob' );

var parcelFinder = require( 'parcel-finder' );
var browserify = require( 'browserify' );
var watchify = require( 'watchify' );
var parcelify = require( 'parcelify' );

var assetUrlTransform = require( './transforms/asset_url' );
var resolveTransform = require( './transforms/resolve' );

var kMetaDataFileName = 'metaData.json';
var kAssetsJsonName = 'assets.json';
var kCommonBundleName = 'common';

module.exports = Cartero;

inherits( Cartero, EventEmitter );

function Cartero( entryPoints, outputDirPath, options ) {
	if( ! ( this instanceof Cartero ) ) return new Cartero( entryPoints, outputDirPath, options );

	var _this = this;

	if( ! entryPoints ) throw new Error( 'Required argument entryPoints was not supplied.' );
	if( ! outputDirPath ) throw new Error( 'Required argument outputDirPath was not supplied.' );

	this.outputDirPath = path.resolve( path.dirname( require.main.filename ), outputDirPath );

	options = _.defaults( {}, options, {
		entryPointFilter : undefined,

		assetTypes : [ 'style', 'image' ],
		assetTypesToConcatenate : [ 'style' ],

		appTransforms : [],
		appTransformDirs : _.isString( entryPoints ) && fs.existsSync( entryPoints ) && fs.lstatSync( entryPoints ).isDirectory() ? [ entryPoints ] : [],

		appRootDir : '/',
		outputDirUrl : '/',
		packageTransform : undefined,

		sourceMaps : false,
		watch : false,
		browserifyOptions : {},

		factorThreshold : function( row, group ) {
			return this.mainPaths.length > 1 && ( group.length >= this.mainPaths.length || group.length === 0 );
			},

		postProcessors : []
	} );

	if( options.logLevel ) log.level = options.logLevel;

	_.extend( this, _.pick( options,
		'entryPointFilter',
		'assetTypes',
		'assetTypesToConcatenate',
		'appTransforms',
		'appTransformDirs',
		'appRootDir',
		'outputDirUrl',
		'packageTransform',
		'sourceMaps',
		'watch',
		'browserifyOptions',
		'factorThreshold',
		'logLevel'
	) );

	this.appRootDir = options.appRootDir;
	this.outputDirUrl = options.outputDirUrl;

	// normalize outputDirUrl so that it starts and ends with a forward slash
	if( this.outputDirUrl.charAt( 0 ) !== '/' ) this.outputDirUrl = '/' + this.outputDirUrl;
	if( this.outputDirUrl.charAt( this.outputDirUrl.length - 1 ) !== '/' ) this.outputDirUrl += '/';

	this.packageManifest = {};
	this.finalBundlesByParcelId = {};
	this.finalCommonBundles = {};

	this.parcelsByEntryPoint = {};
	this.packagePathsToIds = {};

	this.assetsRequiredByEntryPoint = {};
	this.metaDataFileAlreadyWrited = false;

	this.watching = false;

	setTimeout( function() {
		async.series( [ function( nextSeries ) {
			_this._getMainPathsFromEntryPointsArgument( entryPoints, function( err, mainPaths ) {
				if( err ) return nextSeries( err );

				if( mainPaths.length === 0 ) {
					log.error( '', 'No entry points found matching ' + entryPoints );
					return;
				}

				_this.mainPaths = mainPaths;
				nextSeries();
			} )
		}, function( nextSeries ) {
			// delete the output directory
			rimraf( _this.outputDirPath, nextSeries );
		}, function( nextSeries ) {
			// now remake it
			fs.mkdir( _this.outputDirPath, nextSeries );
		}, function( nextSeries ) {
			_this.resolvePostProcessors( options.postProcessors, function( err, res ) {
				if( err ) return nextSeries( err );

				_this.postProcessors = res;
				nextSeries();
			} );

			_this.on( 'error', function( err ) {
				log.error( '', err );
			} );

			_this.on( 'fileWritten', function( filePath, assetType, isBundle, isWatchMode ) {
				filePath = path.relative( process.cwd(), filePath );
				log.info( isWatchMode ? 'watch' : '', '%s %s written to "%s"', assetType, isBundle ? 'bundle' : 'asset', filePath );
			} );
		}, function( nextSeries ) {
			_this.processMains( nextSeries );
		} ], function( err ) {
			if( err ) return _this.emit( 'error', err );

			if( options.watch ) {
				_this.watching = true;
				log.info( 'watching for changes...' );
			}

			_this.emit( 'done' );
		} );
	} );

	return _this;
}

Cartero.prototype._getMainPathsFromEntryPointsArgument = function( entryPoints, callback ) {
	if( _.isString( entryPoints ) && fs.existsSync( entryPoints ) && fs.lstatSync( entryPoints ).isDirectory() ) {
		// old depreciated logic of supplying the view directory, which we need to can for parcels.
		var parcelsDirPath = path.resolve( path.dirname( require.main.filename ), entryPoints );

		parcelFinder( parcelsDirPath, { packageTransform : this.packageTransform }, function( err, detected ) {
			if( err ) return callback( err );

			callback( null, _.reduce( detected, function( memo, thisPkg ) {
				return memo.concat( thisPkg.__mainPath );
			}, [] ) );
		} );
	} else {
		if( ! _.isArray( entryPoints ) ) entryPoints = [ entryPoints ];

		var unfilteredEntryPoints = _.reduce( entryPoints, function( mainPathsMemo, thisEntryPoint ) {
			return mainPathsMemo.concat( glob.sync( thisEntryPoint ) );
		}, [] );

		unfilteredEntryPoints = _.map( unfilteredEntryPoints, function( thisEntryPoint ) {
			return thisEntryPoint.charAt( 0 ) === '/' ? thisEntryPoint : path.resolve( process.cwd(), thisEntryPoint );
		} );

		if( this.entryPointFilter ) callback( null, _.filter( unfilteredEntryPoints, this.entryPointFilter ) );
		else callback( null, unfilteredEntryPoints );
	}
};

Cartero.prototype.processMains = function( callback ) {
	var _this = this;

	log.info( '', 'processing ' + this.mainPaths.length + ' entry points:' );
	log.info( '', this.mainPaths.map( function( thisPath ) {
		return '  ' + thisPath;
	} ).join( '\n' ) );

	var assetTypes = this.assetTypes;
	var assetTypesToConcatenate = this.assetTypesToConcatenate;
	var assetTypesToWriteToDisk = _.difference( assetTypes, assetTypesToConcatenate );

	var tempParcelifyBundlesByEntryPoint = {};
	_.each( this.mainPaths, function( thisMainPath ) {
		tempParcelifyBundlesByEntryPoint[ thisMainPath ] = {};

		_.each( assetTypes, function( thisAssetType ) {
			var fileExtension = thisAssetType === 'style' ? 'css' : thisAssetType;

			tempParcelifyBundlesByEntryPoint[ thisMainPath ][ thisAssetType ] = _.contains( assetTypesToConcatenate, thisAssetType )
				? _this.getTempBundlePath( fileExtension )
				: null
		} );
	} );

	var parcelifyOptions = {
		bundlesByEntryPoint : tempParcelifyBundlesByEntryPoint,
		// appTransforms : _this.appTransforms,
		// appTransformDirs : _this.appTransformDirs,
		watch : this.watch,
		existingPackages : this.packageManifest,
		logLevel : this.logLevel
	};

	var packageFilter = function( pkg, dirPath ) {
		if( pkg._hasBeenTransformedByCartero ) return pkg;

		if( _this.packageTransform ) pkg = _this.packageTransform( pkg, dirPath );

		if( ! pkg.browserify ) pkg.browserify = {};
		if( ! pkg.browserify.transform ) pkg.browserify.transform = [];

		if( pkg.transforms ) {
			// curry transforms in the 'transforms' key to browserify
			pkg.browserify.transform = pkg.transforms.concat( pkg.browserify.transform );
		}

		// we used to apply these transforms in here, but there was a problem with watch, i think related to #226 (https://github.com/substack/watchify/issues/226,
		// which does not happen if we just apply transforms globally. see below
		// pkg.browserify.transform.unshift( function( file ) {
		// 	return replaceStringTransform( file, {
		// 		find : /##asset_url\(\ *(['"])([^'"]*)\1\ *\)/g,
		// 		replace : function( file, wholeMatch, quote, assetSrcPath ) {
		// 			var assetSrcAbsPath;

		// 			try {
		// 				assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
		// 			} catch( err ) {
		// 				return _this.emit( 'error', new Error( 'Could not resolve ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
		// 			}

		// 			return '##asset_url(' + quote + assetSrcAbsPath + quote + ')';
		// 		}
		// 	} );
		// } );

		// pkg.browserify.transform.unshift( function( file ) {
		// 	return resolveTransform( file, {
		// 		appRootDir : _this.appRootDir
		// 	} );
		// } );

		if( _this.appTransforms ) {
			dirPath = fs.realpathSync( dirPath );

			var pkgIsInAppTransformsDir = _.find( _this.appTransformDirs, function( thisAppDirPath ) {
				var relPath = path.relative( thisAppDirPath, dirPath );
				var needToBackup = relPath.charAt( 0 ) === '.' && relPath.charAt( 1 ) === '.';
				var appTransformsApplyToThisDir = ! needToBackup && relPath.indexOf( 'node_modules' ) === -1;
				return appTransformsApplyToThisDir;
			} );

			if( pkgIsInAppTransformsDir ) {
				if( ! pkg.browserify ) pkg.browserify = {};
				if( ! pkg.browserify.transform ) pkg.browserify.transform = [];
				pkg.browserify.transform = _this.appTransforms.concat( pkg.browserify.transform );

				if( ! pkg.transforms ) pkg.transforms = [];
				pkg.transforms = _this.appTransforms.concat( pkg.transforms );
			}
		}

		pkg._hasBeenTransformedByCartero = true;

		return pkg;
	}

	var browserifyOptions = { entries : this.mainPaths, packageFilter : packageFilter, debug : this.sourceMaps };
	if( this.watch ) _.extend( browserifyOptions, { cache : {}, packageCache : {} } );
	if( this.browserifyOptions ) _.extend( browserifyOptions, this.browserifyOptions );

	var browserifyInstance = browserify( browserifyOptions );
	if( this.watch ) watchify( browserifyInstance );

	browserifyInstance._bpack.hasExports = true;

	// applying transforms globally on account of #226
	browserifyInstance.transform( function( file ) {
		return resolveTransform( file, {
			appRootDir : _this.appRootDir
		} );
	}, { global : true } );

	// this is kind of a hack. the problem is that the only time we can apply transforms to individual javascript
	// files is using the browserify global transform. however, at the time those transforms are run we
	// do not yet know all our package ids, so we can't map the src path the the url yet. but we do need to
	// resolve relative paths at this time, because once the js files are bundled the tranform will be
	// passed a new path (that of the bundle), and we no longer be able to resolve those relative paths.
	// Therefore for the case of js files we do this transform in two phases. The first is to resolve the
	// src file to an absolute path (which we do using a browserify global transform), and the second is
	// to resolve that absolute path to a url (which we do once we know all our package ids).
	// replace relative ##urls with absolute ones
	browserifyInstance.transform( function( file ) {
		return replaceStringTransform( file, {
				find : /##asset_url\(\ *(['"])([^'"]*)\1\ *\)/g,
				replace : function( file, wholeMatch, quote, assetSrcPath ) {
					var assetSrcAbsPath;

					try {
						assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
					} catch( err ) {
						return _this.emit( 'error', new Error( 'Could not resolve ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
					}

					return '##asset_url(' + quote + assetSrcAbsPath + quote + ')';
				}
			} );
	}, { global : true } );

	this.emit( 'browserifyInstanceCreated', browserifyInstance, this.mainPaths );

	var p = parcelify( browserifyInstance, parcelifyOptions );

	var needToWriteCommonJsBundle = false;
	var commonJsBundleContents;
	var tempJavascriptBundleEmitter = new EventEmitter();

	var tempBundlesByEntryPoint = {}; // hash of entry points to asset types hashes e.g. { "<entryPointPath>" : { script : "<scriptTempBundlePath", style : "<styleTempBundlePath>" } }
	var tempCommonBundles = {}; // hash of entry asset types { script : "<commonScriptTempBundlePath", style : "<commonStyleTempBundlePath>" } }

	tempJavascriptBundleEmitter.setMaxListeners( 0 ); // don't warn if we got lots of listeners, as we need 1 per entry point
	
	factor( browserifyInstance, {
		outputs : function() {
			var tempBundleOutputStreams = [];

			_.each( _this.mainPaths, function( thisEntryPoint ) {
				var thisJsBundlePath = _this.getTempBundlePath( 'js' );
				var writeStream = fs.createWriteStream( thisJsBundlePath, { encoding : 'utf8' } );

				writeStream.on( 'finish', function() {
					tempJavascriptBundleEmitter.emit( 'tempBundleWritten', thisEntryPoint, thisJsBundlePath );
				} );

				tempBundleOutputStreams.push( writeStream );
			} );

			return tempBundleOutputStreams;
		},
		threshold : function( row, group ) {
			var putIntoCommonBundle = _this.factorThreshold( row, group );
			needToWriteCommonJsBundle = needToWriteCommonJsBundle || putIntoCommonBundle;
			return putIntoCommonBundle;
		}
	} );

	function waitForAndRegisterBrowserifyBundles( nextParallel ) {
		var numberOfBundlesWritten = 0;

		tempJavascriptBundleEmitter.on( 'tempBundleWritten', function( thisMainPath, tempBundlePath ) {
			numberOfBundlesWritten++;

			tempBundlesByEntryPoint[ thisMainPath ] = tempBundlesByEntryPoint[ thisMainPath ] || {};
			tempBundlesByEntryPoint[ thisMainPath ].script = tempBundlePath;

			// don't have to do anything here... we are just waiting until all of our
			// temp bundles have been written before moving on. see below comments

			if( numberOfBundlesWritten === _this.mainPaths.length ) nextParallel();
		} );
	}

	if( this.watch ) {
		browserifyInstance.on( 'update', function() {
			log.info( 'Javascript change detected; recreating javascript bundles...' );

			async.parallel( [ function( nextParallel ) {
				browserifyInstance.bundle( function( err, buf ) {
					if( err ) {
						delete err.stream; // gets messy if we dump this to the console
						log.error( '', err );
						return;
					}

					commonJsBundleContents = buf;
					nextParallel();
				} );
			}, function( nextParallel ) {
				waitForAndRegisterBrowserifyBundles( nextParallel );
			} ], function( err ) {
				if( err ) return _this.emit( 'error', err );

				_this.writeFinalBundles( tempBundlesByEntryPoint, tempCommonBundles, function( err ) {
					if( err ) return _this.emit( 'error', err );
				
					_this.writeMetaDataFile( function( err ) {
						if( err ) return _this.emit( 'error', err );

						// done
					} );
				} );
			} );
		} );
	}

	// in parallel, let parcelify and browserify do their things
	async.parallel( [ function( nextParallel ) {
		browserifyInstance.bundle( function( err, buf ) {
			if( err ) {
				delete err.stream; // gets messy if we dump this to the console
				log.error( '', err );
				_this.emit( 'error', err );
				return;
			}

			commonJsBundleContents = buf;
			nextParallel();
		} );
	}, function( nextParallel ) {
		p.on( 'done', nextParallel );
	}, function( nextParallel ) {
		waitForAndRegisterBrowserifyBundles( nextParallel );
	} ], function( err ) {
		if( err ) return callback( err );

		// we have to make sure that parcelify is done before executing this code, since we look up
		// thisParcel in a structure that is generated via parcelify evants. also, we need to make sure
		// that all our temp js bundles have been written, since otherwise we will have nothing to
		// copy. thus all the crazy async stuff involved.

		async.series( [ function( nextSeries ) {
			if( ! needToWriteCommonJsBundle ) return nextSeries();

			if( needToWriteCommonJsBundle ) {
				tempCommonBundles.script = _this.getTempBundlePath( 'js' );
				fs.writeFile( tempCommonBundles.script, commonJsBundleContents, nextSeries );
			}
		}, function( nextSeries ) {
			_this.writeFinalBundles( tempBundlesByEntryPoint, tempCommonBundles, nextSeries );
		}, function( nextSeries ) {
			// finally, write the meta data file
			_this.writeMetaDataFile( nextSeries );
		} ], function( err ) {
			if( err ) _this.emit( 'error', err );

			if( callback ) callback(); // and we're done
		} );
	} );

	p.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			_this.parcelsByEntryPoint[ newPackage.mainPath ] = newPackage;
		}

		_this.packagePathsToIds[ newPackage.path ] = newPackage.id;

		// calculates the shasum for the assets
		_this.assetMap = _this.assetMap || {};
		async.each( assetTypesToWriteToDisk, function( thisAssetType, nextAssetType ) {
			// We dont need to process assets that are in assetTypesToConcatenate
			if ( _this.assetTypesToConcatenate.indexOf( thisAssetType ) !== -1 ) return nextAssetType();

			async.each( newPackage.assetsByType[ thisAssetType ], function( thisAsset, nextAsset ) {
				_this.addAssetToAssetMap( newPackage, thisAsset );
			} );
		} );

		// add the transform that will replace "url()" references in style assets
		newPackage.addTransform( replaceStringTransform, {
			find : /url\(\s*[\"\']?([^)\'\"]+)\s*[\"\']?\s*\)/g,
			replace : function( file, match, theUrl ) {
				theUrl = theUrl.trim();

				// absolute urls stay the same.
				if( theUrl.charAt( 0 ) === '/' ) return match;
				if( theUrl.indexOf( 'data:' ) === 0 ) return match; // data url, don't mess with this

				var absoluteAssetPath = path.resolve( path.dirname( file ), theUrl );
				var newAssetUrlRelativeToOutputDir = _this.assetMap[ path.relative( _this.appRootDir, absoluteAssetPath ) ]; // example: <packageId>/images/photo_<shasum>.png

				var relativeUrlFromCssFileDirToNewAsset;

				if( ! newAssetUrlRelativeToOutputDir ) {
					// this happen when we have packages that have assets references that are not specified
					// in the image tag in package.json. It happens in modules like jqueryui
					log.warn( '', 'Url reference "' + theUrl + '" from "' + file + '" could not be resolved.' );
					return 'url( \'' + theUrl + '\' )';
				}

				// make this url relative to the <packageId> to not tide the css assets
				// to the filesystem where was compiled
				return 'url( \'../' + newAssetUrlRelativeToOutputDir + '\' )';
			}
		}, 'style' );

		newPackage.addTransform( assetUrlTransform, {
			packagePathsToIds : _this.packagePathsToIds,
			outputDirUrl : _this.outputDirUrl,
			assetMap: _this.assetMap,
			appRootDir : _this.appRootDir
		}, 'style', true );

		newPackage.addTransform( function( file ) {
			return resolveTransform( file, {
				appRootDir : _this.appRootDir
			} );
		}, {}, 'style', true );

		_this.writeIndividualAssetsToDisk( newPackage, assetTypesToWriteToDisk, function( err ) {
			if( err ) return _this.emit( 'error', err );

			_this.emit( 'packageCreated', newPackage );
		} );
	} );

	p.on( 'bundleWritten', function( bundlePath, assetType, thisParcel, watchModeUpdate ) {
		tempBundlesByEntryPoint[ thisParcel.mainPath ] = tempBundlesByEntryPoint[ thisParcel.mainPath ] || {};
		tempBundlesByEntryPoint[ thisParcel.mainPath ][ assetType ] = bundlePath;

		if( watchModeUpdate ) {
			_this.writeFinalBundles( tempBundlesByEntryPoint, tempCommonBundles, function( err ) {
				if( err ) return _this.emit( 'error', err );

				_this.writeMetaDataFile( function( err ) {
					if( err ) return _this.emit( 'error', err );
					
					// done
				} );
			} );
		}
	} );

	if( _this.watch ) {
		p.on( 'assetUpdated', function( eventType, asset, thePackage ) {
			async.series( [ function( nextSeries ) {
				if( _.contains( assetTypesToWriteToDisk, asset.type ) ) {
					if( eventType === 'added' || eventType === 'changed' ) {
						// if this asset has been changed, do NOT update the entry in the asset map, beacuse that could
						// cause the shasum to change, which means that any existing references to this asset (for example, in
						// stylesheets) would break, since they will still reference the old shasum. no worries, just keep
						// the shasum the same in this case (i.e. don't update the asset map) and everybody is happy.
						if( eventType === 'added' ) _this.addAssetToAssetMap( thePackage, asset );

						_this.writeIndividualAssetsToDisk( thePackage, [ asset.type ], nextSeries );
					} else {
						if( fs.existsSync( asset.dstPath ) ) fs.unlinkSync( asset.dstPath );
						nextSeries();
					}
				}
			}, function( nextSeries ) {
				async.each( thePackage.dependentParcels, function( thisParcel, nextParallel ) {
					_this.compileAssetsRequiredByParcel( thisParcel );
					nextParallel();
				}, nextSeries );
			} ], function( err ) {
				if( err ) return _this.emit( 'error', err );

				_this.writeMetaDataFile( function( err ) {
					if( err ) return _this.emit( 'error', err );
					
					// done
				} );
			} );
		} );

		p.on( 'packageJsonUpdated', function( thePackage ) {
			_this.writeIndividualAssetsToDisk( thePackage, assetTypesToWriteToDisk, function( err ) {
				if( err ) return _this.emit( 'error', err );

				_this.writeMetaDataFile( function( err ) {
					if( err ) return _this.emit( 'error', err );
					
					// done
				} );
			} );
		} );
	}
};

Cartero.prototype.copyTempBundleToFinalDestination = function( tempBundlePath, assetType, finalBundlePathWithoutShasumAndExt, callback ) {
	var _this = this;

	mkdirp( path.dirname( finalBundlePathWithoutShasumAndExt ), function( err ) {
		if( err ) return callback( err );

		var bundleStream = fs.createReadStream( tempBundlePath );
		var bundleShasum;

		bundleStream.on( 'error', function( err ) {
			return callback( err );
		} );

		bundleStream.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
			bundleShasum = buf.toString( 'hex' );
			var finalBundlePath = finalBundlePathWithoutShasumAndExt + '_' + bundleShasum  + path.extname( tempBundlePath );

			bundleStream = fs.createReadStream( tempBundlePath );

			// this is part of a hack to apply the ##url transform to javascript files. see comments in transforms/resolveRelativeAssetUrlsToAbsolute
			var postProcessorsToApply = _.clone( _this.postProcessors );
			if( assetType === 'script' ) postProcessorsToApply.unshift( function( file ) { return assetUrlTransform( file, {
				packagePathsToIds : _this.packagePathsToIds,
				outputDirUrl : _this.outputDirUrl,
				assetMap: _this.assetMap,
				appRootDir : _this.appRootDir
			} ); } );

			if( postProcessorsToApply.length !== 0 ) {
				// apply post processors
				bundleStream = bundleStream.pipe( combine.apply( null, postProcessorsToApply.map( function( thisPostProcessor ) {
					return thisPostProcessor( finalBundlePath );
				} ) ) );
			}

			bundleStream.pipe( fs.createWriteStream( finalBundlePath ).on( 'close', function() {
				if( fs.existsSync( tempBundlePath ) ) fs.unlinkSync( tempBundlePath );
				_this.emit( 'fileWritten', finalBundlePath, assetType, true, this.watching );

				callback( null, finalBundlePath );
			} ) );
		} ) );
	} );
};

Cartero.prototype.writeFinalBundles = function( tempBundlesByEntryPoint, tempCommonBundles, callback ) {
	var _this = this;

	async.series( [ function( nextSeries ) {
		// need to write common bundle first, if there is one, so we know its path when writing parcel asset json files
		async.forEachOf( tempCommonBundles, function( thisTempCommonBundlePath, assetType, nextEach ) {
			var commonBundlePathWithoutShasumAndExt = path.join( _this.outputDirPath, kCommonBundleName );
			var oldBundlePath = _this.finalCommonBundles[ assetType ];

			delete tempCommonBundles[ assetType ];

			_this.copyTempBundleToFinalDestination( thisTempCommonBundlePath, assetType, commonBundlePathWithoutShasumAndExt, function( err, finalBundlePath ) {
				if( err ) return nextEach( err );

				_this.finalCommonBundles[ assetType ] = finalBundlePath;

				if( _this.watching ) {
					// if there is an old bundle that already exists, delete it. this
					// happens in watch mode when a new bundle is generated. (note the old bundle 
					// likely does not have the same path as the new bundle due to sha1)
					if( oldBundlePath && oldBundlePath !== finalBundlePath && fs.existsSync( oldBundlePath ) ) fs.unlinkSync( oldBundlePath );
				}

				nextEach();
			} );
		}, nextSeries );
	}, function( nextSeries ) {
		
		async.forEachOf( tempBundlesByEntryPoint, function( thisParcelTempBundles, thisMainPath, nextEntryPoint ) {
			var thisParcel = _this.parcelsByEntryPoint[ thisMainPath ];

			async.forEachOf( thisParcelTempBundles, function( thisTempBundlePath, assetType, nextAssetType ) {
				var outputDirPath = _this.getPackageOutputDirectory( thisParcel );
				var parcelBaseName = path.basename( thisParcel.path );
				var finalBundlePathWithoutShasumAndExt = path.join( outputDirPath, parcelBaseName + '_bundle' );
				var oldBundlePath = _this.finalBundlesByParcelId[ thisParcel.id ] && _this.finalBundlesByParcelId[ thisParcel.id ][ assetType ];

				delete tempBundlesByEntryPoint[ thisMainPath ][ assetType ];
				
				_this.copyTempBundleToFinalDestination( thisTempBundlePath, assetType, finalBundlePathWithoutShasumAndExt, function( err, finalBundlePath ) {
					if( err ) return nextAssetType( err );

					_this.finalBundlesByParcelId[ thisParcel.id ] = _this.finalBundlesByParcelId[ thisParcel.id ] || {};
					_this.finalBundlesByParcelId[ thisParcel.id ][ assetType ] = finalBundlePath;

					if( _this.watching ) {
						// if there is an old bundle that already exists for this asset type, delete it. this
						// happens in watch mode when a new bundle is generated. (note the old bundle
						// likely does not have the same path as the new bundle due to sha1)

						if( oldBundlePath && oldBundlePath !== finalBundlePath && fs.existsSync( oldBundlePath ) ) fs.unlinkSync( oldBundlePath );
					}

					nextAssetType();
				} );
			}, function( err ) {
				if( err ) return nextEntryPoint( err );
				
				delete tempBundlesByEntryPoint[ thisMainPath ];
				 _this.compileAssetsRequiredByParcel( thisParcel );

				nextEntryPoint();
			} );
		}, nextSeries );
	} ], callback );
};

Cartero.prototype.compileAssetsRequiredByParcel = function( parcel ) {
	var _this = this;
	var bundles = _this.finalBundlesByParcelId[ parcel.id ];

	var content = {};

	// if we have a common bundle, it needs to come before parcel specific bundle
	_.each( this.finalCommonBundles, function( thisBundlePath, thisAssetType ) {
		content[ thisAssetType ] = content[ thisAssetType ] || [];
		content[ thisAssetType ].push( path.relative( _this.outputDirPath, thisBundlePath ) );
	} );

	_.each( _this.assetTypes.concat( [ 'script' ] ), function( thisAssetType ) {
		var concatenateThisAssetType = thisAssetType === 'script' || _.contains( _this.assetTypesToConcatenate, thisAssetType );
		var filesOfThisType;

		if( concatenateThisAssetType ) filesOfThisType = bundles && bundles[ thisAssetType ] ? [ bundles[ thisAssetType ] ] : [];
		else filesOfThisType = _.pluck( parcel.parcelAssetsByType[ thisAssetType ], 'dstPath' );

		content[ thisAssetType ] = _.union( content[ thisAssetType ], _.map( filesOfThisType, function( absPath ) {
			return path.relative( _this.outputDirPath, absPath );
		} ));
	} );

	_this.assetsRequiredByEntryPoint[ _this.getPackageMapKeyFromPath( parcel.mainPath ) ] = content;
};

Cartero.prototype.getPackageOutputDirectory = function( thePackage ) {
	return path.join( this.outputDirPath, thePackage.id );
};

Cartero.prototype.getTempBundlePath = function( fileExtension ) {
	return path.join( tmpdir, 'cartoro_bundle_' + Math.random() + Math.random() ) + '.' + fileExtension;
};

Cartero.prototype.resolvePostProcessors = function( postProcessorNames, callback ) {
	async.map( postProcessorNames, function( thisPostProcessorName, nextPostProcessorName ) {
		if( _.isFunction( thisPostProcessorName ) ) return nextPostProcessorName( null, thisPostProcessorName );
		resolve( thisPostProcessorName, { basedir : process.cwd() }, function( err, modulePath ) {
			if( err ) return nextPostProcessorName( err );

			nextPostProcessorName( null, require( modulePath ) );
		} );
	}, callback );
};

Cartero.prototype.writeIndividualAssetsToDisk = function( thePackage, assetTypesToWriteToDisk, callback ) {
	var _this = this;
	var outputDirectoryPath = this.getPackageOutputDirectory( thePackage );

	assetTypesToWriteToDisk = _.intersection( assetTypesToWriteToDisk, Object.keys( thePackage.assetsByType ) );

	async.each( assetTypesToWriteToDisk, function( thisAssetType, nextAssetType ) {
	
		async.each( thePackage.assetsByType[ thisAssetType ], function( thisAsset, nextAsset ) {
			var thisAssetDstPath = path.join( _this.outputDirPath, _this.assetMap[ path.relative( _this.appRootDir, thisAsset.srcPath ) ] ); // assetMap contains path starting from fingerprint folder
			if( thisAssetType === 'style' ) thisAssetDstPath = renameFileExtension( thisAssetDstPath, '.css' );

			thisAsset.writeToDisk( thisAssetDstPath, function( err ) {
				if( err ) return nextAsset( err );

				_this.applyPostProcessorsToFiles( [ thisAssetDstPath ], function( err ) {
					if( err ) return nextAsset( err );

					_this.emit( 'fileWritten', thisAssetDstPath, thisAssetType, false, _this.watching );

					// if( _this.watching ) _this.writeMetaDataFile( function() {} );

					nextAsset();
				} );
			} );
		}, nextAssetType );
	}, function( err ) {
		// why were we doing this? metaData does not contain references to individual assets
		// if( _this.watching ) _this.writeMetaDataFile( callback );

		callback();
	} );
};

Cartero.prototype.addAssetToAssetMap = function( thePackage, asset ) {
	var fileContent = fs.readFileSync( asset.srcPath, 'utf-8' );
	var shasum = crypto.createHash( 'sha1' );

	shasum.update( fileContent );

	var fileShasum = shasum.digest( 'hex' );
	var fileName = path.relative( thePackage.path, asset.srcPath );
	var fileExt = path.extname( fileName );
	var newFileName = path.basename( fileName, fileExt ) + '_' + fileShasum + fileExt;

	// save the old and new path so that our asset_url transforms can figure out
	// the asset url (which is symmetric to the new relative path) later
	var thisAssetDstPath = path.relative( thePackage.path, asset.srcPath );
	var relativeAssetDir = path.dirname( thisAssetDstPath );

	// relativeAssetPath will be the path of the asset relative to the output directory
	// example: <packageId>/images/photo_<shasum>.png
	var relativeAssetPath = path.join( thePackage.id, relativeAssetDir, newFileName );

	// the keys of assetMap are relative paths from appRootDir to the source asset files.
	// the values are relative paths from outputDir to the output asset files
	this.assetMap[ path.relative( this.appRootDir, asset.srcPath ) ] = relativeAssetPath;
};

Cartero.prototype.applyPostProcessorsToFiles = function( filePaths, callback ) {
	var _this = this;

	if( _this.postProcessors.length === 0 ) return callback();

	async.each( filePaths, function( thisFilePath, nextFilePath ) {
		var stream = fs.createReadStream( thisFilePath );

		stream = stream.pipe( combine.apply( null, _this.postProcessors.map( function( thisPostProcessor ) {
			return thisPostProcessor( thisFilePath );
		} ) ) );

		var tempFilePath = path.join( tmpdir, 'cartero_asset' + Math.random() + Math.random() );

		stream.pipe( fs.createWriteStream( tempFilePath ).on( 'close', function( err ) {
			if( err ) return nextFilePath( err );

			fs.createReadStream( tempFilePath ).pipe( fs.createWriteStream( thisFilePath ).on( 'close', function( err ) {
				fs.unlink( tempFilePath, nextFilePath );
			} ) );
		} ) );
	}, callback );
};


// f( postProcessorsToApply.length !== 0 ) {
// 	// apply post processors
// 	bundleStream = bundleStream.pipe( combine.apply( null, postProcessorsToApply.map( function( thisPostProcessor ) {
// 		return thisPostProcessor( finalBundlePath );
// 	} ) ) );
// }

// bundleStream.pipe( fs.createWriteStream( finalBundlePath ).on( 'close', function() {
// 	if( fs.existsSync( tempBundlePath ) ) fs.unlinkSync( tempBundlePath );
// 	_this.emit( 'fileWritten', finalBundlePath, assetType, true, this.watching );

// 	callback( null, finalBundlePath );
// } ) );

Cartero.prototype.writeMetaDataFile = function( callback ) {
	var _this = this;

	var metaDataFilePath = path.join( _this.outputDirPath, kMetaDataFileName );
	var packageMap = _.reduce( _this.packagePathsToIds, function( memo, thisPackageId, thisPackagePath ) {
		var thisPackageKey = _this.getPackageMapKeyFromPath( thisPackagePath );

		// // parcels need to take precedence over packages. if we have a situation where one package has
		// // multiple incarnations and one is a parcel, we have to make sure the parcel takes precedence.
		// // note that if we had a situation where there was more than one incarnation as a parcel, we
		// // might run into problems. can cross that bridge when we get to it...
		// if( _this.parcelMap[ thisPackageKey ] ) thisPackageId = _this.parcelMap[ thisPackageKey ];

		memo[ thisPackageKey ] = thisPackageId;
		return memo;
	}, {} );

	var entryPointMap = _.reduce( _this.parcelsByEntryPoint, function( entryPointMapMemo, thisParcel ) {
		entryPointMapMemo[ _this.getPackageMapKeyFromPath( thisParcel.mainPath ) ] = thisParcel.id;
		return entryPointMapMemo;
	}, {} );

	var metaData = JSON.stringify( {
		formatVersion : 4,
		packageMap : packageMap,
		entryPointMap : entryPointMap,
		assetsRequiredByEntryPoint : _this.assetsRequiredByEntryPoint,
		assetMap: _this.assetMap
	}, null, 4 );

	fs.writeFile( metaDataFilePath, metaData, function( err ) {
		if( err ) return callback( err );
		_this.metaDataFileAlreadyWrited = true;

		callback();
	} );
};

Cartero.prototype.getPackageMapKeyFromPath = function( thePath ) {
	//var key = crypto.createHash( 'sha1' ).update( key ).digest( 'hex' );
	return path.relative( this.appRootDir, thePath );
};

/********************* Utility functions *********************/

function renameFileExtension( file, toExt ) {
	return file.replace( new RegExp( path.extname( file ) + "$" ), toExt );
}

function printDependencies( thePackage, level, traversedPackagePaths ) {
	// for debugging

	if( ! traversedPackagePaths ) traversedPackagePaths = [];

	var levelStr = '';
	for( var curLevel = level; curLevel > 0; curLevel-- ) levelStr += '   ';

	var haveAlreadyTraversed = _.contains( traversedPackagePaths, thePackage.path );

	console.log( levelStr + thePackage.path + ( haveAlreadyTraversed ? ' *' : '' ) );

	if( ! haveAlreadyTraversed ) {
		traversedPackagePaths.push( thePackage.path );

		_.each( thePackage.dependencies, function( thisDependency ) {
			printDependencies( thisDependency, level + 1, traversedPackagePaths );
		} );
	}
}
