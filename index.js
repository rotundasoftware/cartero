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

var kMetaDataFileName = 'metaData.json';
var kAssetsJsonName = 'assets.json';
var kCommonJavascriptBundleName = 'common';

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

	this.parcelsByEntryPoint = {};
	this.packagePathsToIds = {};

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
}

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

		// this is kind of a hack. the problem is that the only time we can apply transforms to individual javascript
		// files is using the browserify global transform. however, at the time those transforms are run we
		// do not yet know all our package ids, so we can't map the src path the the url yet. but we do need to
		// resolve relative paths at this time, because once the js files are bundled the tranform will be
		// passed a new path (that of the bundle), and we no longer be able to resolve those relative paths.
		// Therefore for the case of js files we do this transform in two phases. The first is to resolve the
		// src file to an absolute path (which we do using a browserify global transform), and the second is
		// to resolve that absolute path to a url (which we do once we know all our package ids).
		// replace relative ##urls with absolute ones
		pkg.browserify.transform.unshift( function( file ) {
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
		} );

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

	this.emit( 'browserifyInstanceCreated', browserifyInstance, this.mainPaths );

	var p = parcelify( browserifyInstance, parcelifyOptions );

	var needToWriteCommonJsBundle = false;
	var commonJsBundleContents;
	var tempJsBundlesByEntryPoint;
	var tempJavascriptBundleEmitter = new EventEmitter();

	tempJavascriptBundleEmitter.setMaxListeners( 0 ); // don't warn if we got lots of listeners, as we need 1 per entry point
	
	function createTempJsBundleStreamsByEntryPoint() {
		tempJsBundlesByEntryPoint = _.map( _this.mainPaths, function( thisEntryPoint ) {
			var thisJsBundlePath = _this.getTempBundlePath( 'js' );
			var writeStream = fs.createWriteStream( thisJsBundlePath, { encoding : 'utf8' } );

			writeStream.on( 'finish', function() {
				tempJavascriptBundleEmitter.emit( 'tempBundleWritten', thisEntryPoint, thisJsBundlePath );
			} );

			return { path : thisJsBundlePath, stream : writeStream };
		} )
	}

	factor( browserifyInstance, {
		outputs : function() {
			createTempJsBundleStreamsByEntryPoint();
			return _.pluck( tempJsBundlesByEntryPoint, 'stream' );
		},
		threshold : function( row, group ) {
			var putIntoCommonBundle = _this.factorThreshold( row, group );
			needToWriteCommonJsBundle = needToWriteCommonJsBundle || putIntoCommonBundle;
			return putIntoCommonBundle;
		}
	} );

	if( this.watch ) {
		browserifyInstance.on( 'update', function() {
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
				var numberOfBundlesWritten = 0;

				tempJavascriptBundleEmitter.on( 'tempBundleWritten', function( thisMainPath, tempBundlePath ) {
					numberOfBundlesWritten++;

					// don't have to do anything here... we are just waiting until all of our
					// temp bundles have been written before moving on.

					if( numberOfBundlesWritten === _this.mainPaths.length ) nextParallel();
				} );
			} ], function( err ) {

				_this.writeAllFinalJavascriptBundles( tempJsBundlesByEntryPoint, needToWriteCommonJsBundle ? commonJsBundleContents : null, function() {
					// done
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
				_this.emit( 'error', err);
				return;
			}

			commonJsBundleContents = buf;
			nextParallel();
		} );
	}, function( nextParallel ) {
		p.on( 'done', nextParallel );
	}, function( nextParallel ) {
		var numberOfBundlesWritten = 0;

		tempJavascriptBundleEmitter.on( 'tempBundleWritten', function( thisMainPath, tempBundlePath ) {
			numberOfBundlesWritten++;

			// don't have to do anything here... we are just waiting until all of our
			// temp bundles have been written before moving on. see below comments

			if( numberOfBundlesWritten === _this.mainPaths.length ) nextParallel();
		} );
	} ], function( err ) {
		if( err ) return callback( err );

		// we have to make sure that parcelify is done before executing this code, since we look up
		// thisParcel in a structure that is generated via parcelify evants. also, we need to make sure
		// that all our temp js bundles have been written, since otherwise we will have nothing to
		// copy. thus all the crazy async stuff involved.

		_this.writeAllFinalJavascriptBundles( tempJsBundlesByEntryPoint, needToWriteCommonJsBundle ? commonJsBundleContents : null, function( err ) {
			if( err ) return callback( err );

			// finally, write the meta data file
			_this.writeMetaDataFile( function( err ) {
				if( err ) _this.emit( 'error', err );

				if( callback ) callback(); // and we're done
			} );
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

				var fileContent = fs.readFileSync( thisAsset.srcPath, 'utf-8' );
				var shasum = crypto.createHash( 'sha1' );

				shasum.update(fileContent);

				var fileShasum =shasum.digest('hex');
				var fileName = path.relative( newPackage.path, thisAsset.srcPath );
				var fileExt = path.extname( fileName );
				var newFileName = path.basename( fileName, fileExt ) + '_' + fileShasum + fileExt;

				// save the old name and new name for later use with the transforms
				_this.assetMap[ thisAsset.srcPath ] = newFileName;
			});
		});

		newPackage.addTransform( replaceStringTransform, {
			find : /url\(\s*[\"\']?([^)\'\"]+)\s*[\"\']?\s*\)/g,
			replace : function( file, match, theUrl ) {
				theUrl = theUrl.trim();

        debugger;
        //TODO
				// absolute urls stay the same.
				if( theUrl.charAt( 0 ) === '/' ) return match;
				if( theUrl.indexOf( 'data:' ) === 0 ) return match; // data url, don't mess with this

        var absoluteAssetPath = path.resolve( path.dirname( file ), theUrl );
				//var newAssetPath = _this.assetMap[ absoluteAssetPath ];
				//var newAssetName = path.baseName(absoluteAssetPath); //so close but missing the subdir (images/) so this is just the image name TODO
        var newAssetName = _this.assetMap[ absoluteAssetPath ];

				if ( newAssetName ) {
					// replace the url with the new name
					//theUrl = path.join( path.dirname( theUrl ), newAssetName );
          theUrl = newAssetName;
          console.log('theUrl: ', theUrl);
				} else {
					// this happen when we have packages that have assets references that are not specified
					// in the image tag in package.json. It happens in modules like jqueryui
					log.warn( file, 'Asset reference ' + theUrl + ' cannot be resolved.' );
				}

				var cssFilePathRelativeToPackageDir = path.relative( newPackage.path, file );
				var cssFileDirPathRelativeToPackageDir = path.dirname( '/' + cssFilePathRelativeToPackageDir );
				if( cssFileDirPathRelativeToPackageDir !== '/' ) cssFileDirPathRelativeToPackageDir += '/';

				// urls in css files are relative to the css file itself
        debugger;
				var absUrl = url.resolve( cssFileDirPathRelativeToPackageDir, theUrl );

        console.log('cssFileDirPathRelativeToPackageDir: ', cssFileDirPathRelativeToPackageDir);

        console.log('absUrl: ',absUrl);

				absUrl = _this.outputDirUrl + newPackage.id + absUrl;

        console.log('final absUrl: ',absUrl);

				return 'url( \'' + absUrl + '\' )';
			}
		}, 'style' );

		newPackage.addTransform( assetUrlTransform, {
			packagePathsToIds : _this.packagePathsToIds,
			outputDirUrl : _this.outputDirUrl,
			assetMap: _this.assetMap
		}, 'style' );

		_this.writeIndividualAssetsToDisk( newPackage, assetTypesToWriteToDisk, function( err ) {
			if( err ) return _this.emit( 'error', err );

			_this.emit( 'packageCreated', newPackage );
		} );
	} );

	p.on( 'bundleWritten', function( bundlePath, assetType, thisParcel, watchModeUpdate ) {
		_this.copyTempBundleToParcelDiretory( bundlePath, assetType, thisParcel, function( err ) {
			if( err ) return _this.emit( 'error', err );

			if( watchModeUpdate ) {
				_this.writeAssetsJsonForParcel( thisParcel, function( err ) {
					if( err ) return _this.emit( 'error', err );

					// done
				} );
			}
		} );
	} );

	if( _this.watch ) {
		p.on( 'assetUpdated', function( eventType, asset, thePackage ) {
			async.series( [ function( nextSeries ) {
				if( _.contains( assetTypesToWriteToDisk, asset.type ) ) {
					if( eventType === 'added' || eventType === 'changed' )
						_this.writeIndividualAssetsToDisk( thePackage, [ asset.type ], nextSeries );
					else
						fs.unlink( asset.dstPath, function( err ) {
							if( err ) return _this.emit( 'error', err );
							nextSeries();
						} );
				}
			}, function( nextSeries ) {
				async.each( thePackage.dependentParcels, function( thisParcel, nextParallel ) {
					_this.writeAssetsJsonForParcel( thisParcel, function( err ) {
						if( err ) return _this.emit( 'error', err );

						nextParallel();
					} );
				}, nextSeries );
			} ], function( err ) {
				if( err ) return _this.emit( 'error', err );

				// done
			} );
		} );

		p.on( 'packageJsonUpdated', function( thePackage ) {
			_this.writeIndividualAssetsToDisk( thePackage, assetTypesToWriteToDisk, function( err ) {
				if( err ) return _this.emit( 'error', err );

				// done
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
				assetMap: _this.assetMap
			} ); } );

			if( postProcessorsToApply.length !== 0 ) {
				// apply post processors
				bundleStream = bundleStream.pipe( combine.apply( null, postProcessorsToApply.map( function( thisPostProcessor ) {
					return thisPostProcessor( finalBundlePath );
				} ) ) );
			}

			bundleStream.pipe( fs.createWriteStream( finalBundlePath ).on( 'close', function() {
				fs.unlink( tempBundlePath, function() {} );
				_this.emit( 'fileWritten', finalBundlePath, assetType, true, this.watching );

				callback( null, finalBundlePath );
			} ) );
		} ) );
	} );
};

Cartero.prototype.copyTempBundleToParcelDiretory = function( tempBundlePath, assetType, parcel, callback ) {
	var _this = this;
	var outputDirPath = this.getPackageOutputDirectory( parcel );
	var parcelBaseName = path.basename( parcel.path );
	var finalBundlePathWithoutShasumAndExt = path.join( outputDirPath, parcelBaseName + '_bundle' );
	var oldBundlePath = _this.finalBundlesByParcelId[ parcel.id ] && _this.finalBundlesByParcelId[ parcel.id ][ assetType ];

	this.copyTempBundleToFinalDestination( tempBundlePath, assetType, finalBundlePathWithoutShasumAndExt, function( err, finalBundlePath ) {
		if( err ) return callback( err );

		if( ! _this.finalBundlesByParcelId[ parcel.id ] ) _this.finalBundlesByParcelId[ parcel.id ] = {};
		_this.finalBundlesByParcelId[ parcel.id ][ assetType ] = finalBundlePath;

		if( this.watching ) {
			// if there is an old bundle that already exists for this asset type, delete it. this
			// happens in watch mode when a new bundle is generated. (note the old bundle 
			// likely does not have the same path as the new bundle due to sha1)
			if( oldBundlePath )	{
				fs.unlinkSync( oldBundlePath );
				delete _this.finalBundlesByParcelId[ parcel.id ][ assetType ];
			}
		}

		callback();
	} );
};

Cartero.prototype.writeCommonJavascriptBundle = function( buf, callback ) {
	var _this = this;
	var tempBundlePath = this.getTempBundlePath( 'js' );
	var oldBundlePath = this.commonJsBundlePath;

	fs.writeFile( tempBundlePath, buf, function( err ) {
		if( err ) return callback( err );

		var commonBundlePathWithoutShasumAndExt = path.join( _this.outputDirPath, kCommonJavascriptBundleName );
		_this.copyTempBundleToFinalDestination( tempBundlePath, 'script', commonBundlePathWithoutShasumAndExt, function( err, finalBundlePath ) {
			if( err ) return callback( err );

			_this.commonJsBundlePath = finalBundlePath;

			if( this.watching && oldBundlePath ) {
				// if there is an old bundle that already exists, delete it. this
				// happens in watch mode when a new bundle is generated. (note the old bundle 
				// likely does not have the same path as the new bundle due to sha1)
				fs.unlinkSync( oldBundlePath );
			}

			callback();
		} );
	} );
};

Cartero.prototype.writeAllFinalJavascriptBundles = function( tempJsBundlesByEntryPoint, commonJsBundleContents, callback ) {
	var _this = this;

	async.series( [ function( nextSeries ) {
		// need to write common bundle first, if there is one, so we know its path when writing parcel asset json files
		if( commonJsBundleContents ) _this.writeCommonJavascriptBundle( commonJsBundleContents, function( err ) {
			if( err ) _this.emit( 'error', err );

			nextSeries();
		} );
		else {
			this.commonJsBundleContents = null;
			nextSeries();
		}
	}, function( nextSeries ) {
		async.forEachOf( tempJsBundlesByEntryPoint, function( thisTempBundle, index, nextEach ) {
			var thisMainPath = _this.mainPaths[ index ];
			var thisParcel = _this.parcelsByEntryPoint[ thisMainPath ];

			_this.copyTempBundleToParcelDiretory( thisTempBundle.path, 'script', thisParcel, function( err ) {
				if( err ) return callback( err );

				_this.writeAssetsJsonForParcel( thisParcel, function( err ) {
					if( err ) return callback( err );

					nextEach();
				} );
			} );
		}, nextSeries );
	} ], callback );
};

Cartero.prototype.writeAssetsJsonForParcel = function( parcel, callback ) {
	var _this = this;
	var bundles = _this.finalBundlesByParcelId[ parcel.id ];

	var content = {};

	// if we have a common bundle, it needs to come before parcel specific bundle
	if( this.commonJsBundlePath ) {
		content.script = content.script || [];
		content.script.push( path.relative( this.outputDirPath, this.commonJsBundlePath ) );
	}

	if( bundles && bundles.script ) {
		content.script = content.script || [];
		content.script.push( path.relative( this.outputDirPath, bundles.script ) );
	}

	_.without( _this.assetTypes, 'script' ).forEach( function( thisAssetType ) {
		var concatenateThisAssetType = _.contains( _this.assetTypesToConcatenate, thisAssetType );

		var filesOfThisType;

		if( concatenateThisAssetType ) filesOfThisType = bundles && bundles[ thisAssetType ] ? [ bundles[ thisAssetType ] ] : [];
		else filesOfThisType = _.pluck( parcel.parcelAssetsByType[ thisAssetType ], 'dstPath' );

		content[ thisAssetType ] = _.map( filesOfThisType, function( absPath ) {
			return path.relative( _this.outputDirPath, absPath );
		} );
	} );

	var packageDirPath = this.getPackageOutputDirectory( parcel );
	mkdirp( packageDirPath, function( err ) {
		var assetsJsonPath = path.join( packageDirPath, kAssetsJsonName );
		fs.writeFile( assetsJsonPath, JSON.stringify( content, null, 4 ), function( err ) {
			if( err ) return callback( err );

			return callback();
		} );
	} );
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

			var thisAssetDstPath = path.relative( thePackage.path, thisAsset.srcPath );

			thisAssetDstPath = path.join( outputDirectoryPath, path.dirname( thisAssetDstPath ), _this.assetMap[ thisAsset.srcPath ] );

			if( thisAssetType === 'style' ) thisAssetDstPath = renameFileExtension( thisAssetDstPath, '.css' );

			thisAsset.writeToDisk( thisAssetDstPath, function( err ) {
				if( err ) return nextAsset( err );

				_this.applyPostProcessorsToFiles( [ thisAssetDstPath ], function( err ) {
					if( err ) return nextAsset( err );

					_this.emit( 'fileWritten', thisAssetDstPath, thisAssetType, false, _this.watching );

          _this.assetMap[thisAsset.srcPath] = thisAssetDstPath; //TODO figure out correct place for this, for writing metaData.json assetMap correctly

					// why were we doing this? metaData does not contain references to individual assets
					// if( _this.watching ) _this.writeMetaDataFile( function() {} );

					nextAsset();
				} );
			} );
		}, nextAssetType );
	}, callback );
};

Cartero.prototype.applyPostProcessorsToFiles = function( filePaths, callback ) {
	var _this = this;

	if( _this.postProcessors.length === 0 ) return callback();

	async.each( filePaths, function( thisFilePath, nextFilePath ) {
		var stream = fs.createReadStream( thisFilePath );
		var throughStream;

		stream = stream.pipe( combine.apply( null, _this.postProcessors.map( function( thisPostProcessor ) {
			return thisPostProcessor( thisFilePath );
		} ) ) );

		stream.on( 'end', function() {
			throughStream.pipe( fs.createWriteStream( thisFilePath ).on( 'close', nextFilePath ) );
		} );

		throughStream = stream.pipe( through2() );
	}, callback );
};

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
		formatVersion : 2,
		packageMap : packageMap,
		entryPointMap : entryPointMap,
		assetMap: _this.assetMap
	}, null, 4 );

	fs.writeFile( metaDataFilePath, metaData, function( err ) {
		if( err ) return callback( err );

		callback();
	} );
};

Cartero.prototype.getPackageMapKeyFromPath = function( thePath ) {
	//var key = crypto.createHash( 'sha1' ).update( key ).digest( 'hex' );
	if( this.appRootDir ) return './' + path.relative( this.appRootDir, thePath );
	else return thePath;
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
