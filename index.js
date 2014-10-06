
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
var combine = require( "stream-combiner" );
var resolve = require( "resolve" );
var replaceStringTransform = require( 'replace-string-transform' );
var globwatcher = require( 'globwatcher' ).globwatcher;
var Parcel = require( 'parcelify/lib/parcel.js' );
var log = require( 'npmlog' );

var parcelFinder = require( 'parcel-finder' );
var parcelify = require( 'parcelify' );

var assetUrlTransform = require( './transforms/asset_url' );

var kMetaDataFileName = "metaData.json";
var kAssetsJsonName = "assets.json";

module.exports = Cartero;

inherits( Cartero, EventEmitter );

function Cartero( parcelsDirPathOrArrayOfMains, outputDirPath, options ) {
	if( ! ( this instanceof Cartero ) ) return new Cartero( parcelsDirPathOrArrayOfMains, outputDirPath, options );

	var _this = this;

	if( ! parcelsDirPathOrArrayOfMains ) throw new Error( 'Required argument parcelsDirPathOrArrayOfMains was not supplied.' );
	if( ! outputDirPath ) throw new Error( 'Required argument outputDirPath was not supplied.' );

	if( ! _.isArray( parcelsDirPathOrArrayOfMains ) )
		this.parcelsDirPath = path.resolve( path.dirname( require.main.filename ), parcelsDirPathOrArrayOfMains );
	else this.mainPaths = parcelsDirPathOrArrayOfMains;

	this.outputDirPath = path.resolve( path.dirname( require.main.filename ), outputDirPath );

	options = _.defaults( {}, options, {
		assetTypes : [ 'style', 'image' ],
		assetTypesToConcatenate : [ 'style' ],
	
		appTransforms : [],
		appTransformDirs : this.parcelsDirPath ? [ this.parcelsDirPath ] : [],

		outputDirUrl : '/',
		packageTransform : undefined,

		sourceMaps : false,
		watch : false,
		postProcessors : [],

		browserifyOptions : {},
		browserifyBundleOptions: {}
	} );

	if ( options.logLevel ) log.level = options.logLevel;

	_.extend( this, _.pick( options,
		'assetTypes',
		'assetTypesToConcatenate',
		'appTransforms',
		'appTransformDirs',
		'outputDirUrl',
		'packageTransform',
		'sourceMaps',
		'watch',
		'browserifyOptions',
		'browserifyBundleOptions',
		'logLevel'
	) );

	this.outputDirUrl = options.outputDirUrl;
	if( this.outputDirUrl.charAt( 0 ) !== '/' ) this.outputDirUrl = '/' + this.outputDirUrl;

	this.packageManifest = {};
	this.finalBundlesByParcelId = {};

	this.parcelMap = {};
	this.packagePathsToIds = {};

	this.watching = false;

	async.series( [ function( nextSeries ) {
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
		_this.processParcels( nextSeries );
	} ], function( err ) {
		if( err ) return _this.emit( 'error', err );

		if( options.watch ) {
			if( _this.parcelsDirPath ) {
				var parcelJsonWatcher = globwatcher( path.join( _this.parcelsDirPath, "**/package.json" ) );
				parcelJsonWatcher.on( 'added', function() { _this.processParcels(); } );
				parcelJsonWatcher.on( 'changed', function() { _this.processParcels(); } );
			}

			_this.watching = true;
			log.info( 'watching for changes...' );
		}

		_this.emit( 'done' );
	} );

	return _this;
}

Cartero.prototype.processParcels = function( callback ) {
	var _this = this;

	log.info( _this.watching ? 'watch' : '',
		_this.parcelsDirPath ?
			'processing parcels in "' + path.relative( process.cwd(), _this.parcelsDirPath ) + '"' :
			'processing ' + this.mainPaths.length + ' parcels'
	);

	async.waterfall( [ function( nextWaterfall ) {
		if( _this.mainPaths ) return nextWaterfall( null, _this.mainPaths );

		_this.findMainPaths( _this.packageTransform, function( err, newMains ) {
			if( err ) return _this.emit( 'error', err );

			nextWaterfall( null, newMains );
		} );
	}, function( newMains ) {
		// figure out which mains are new and process those parcels. note there is a case
		// where mains are removed that we do not consider. The issue is that a parcel may
		// have been changed to a package, in which case its directory and associated info
		// is still needed, eventhough it is no longer a parcel. we would have to jump thru
		// hoops in order to ensure that the parcel was correctly re-initialized as a package,
		// so instead of doing all that, just leave everything intact as if the parcel was
		// still there. 
		var oldMains = [];
		_.each( _this.packageManifest, function( thisPackage ) {
			if( thisPackage.mainPath ) oldMains.push( thisPackage.mainPath );
		} );

		var mainsThatWereAdded = _.difference( newMains, oldMains );
		async.each( mainsThatWereAdded, function( thisMain, nextMain ) {
			_this.processMain( thisMain, nextMain );
		}, function( err ) {
			if( err ) _this.emit( 'error', err );

			_this.writeMetaDataFile( function( err ) {
				if( err ) _this.emit( 'error', err );

				if( callback ) callback();
			} );
		} );
	} ] );
};

Cartero.prototype.processMain = function( mainPath, callback ) {
	var _this = this;

	var assetTypes = _this.assetTypes;
	var assetTypesToConcatenate = _this.assetTypesToConcatenate;
	var assetTypesToWriteToDisk = _.difference( assetTypes, assetTypesToConcatenate );

	var tempBundles = {
		script : _this.getTempBundlePath( 'js' ),
		style : _.contains( assetTypesToConcatenate, 'style' ) ? _this.getTempBundlePath( 'css' ) : null,
		//template : _.contains( options.assetTypesToConcatenate, 'template' ) ? _this.getTempBundlePath( 'tmpl' ) : null
		image : null
	};

	var parcelifyOptions = {
		bundles : tempBundles,
		appTransforms : _this.appTransforms,
		appTransformDirs : _this.appTransformDirs,
		packageTransform : _this.packageTransform,
		watch : _this.watch,
		browserifyOptions : _this.browserifyOptions,
		browserifyBundleOptions : _.extend( {}, {
			debug : _this.sourceMaps
		}, _this.browserifyBundleOptions ),
		existingPackages : _this.packageManifest,
		logLevel : _this.logLevel
	};

	log.info( _this.watching ? 'watch' : '', 'processing parcel "%s"', mainPath	);

	var p = parcelify( mainPath, parcelifyOptions );
	var thisParcel;

	p.on( 'browserifyInstanceCreated', function( browserifyInstance ) {
		// this is kind of a hack. the problem is that the only time we can apply transforms to individual javascript
		// files is using the browserify global transform. however, at the time those transforms are run we
		// do not yet know all our package ids, so we can't map the src path the the url yet. but we do need to
		// resolve relative paths at this time, because once the js files are bundled the tranform will be
		// passed a new path (that of the bundle), and we no longer be able to resolve those relative paths.
		// Therefore for the case of js files we do this transform in two phases. The first is to resolve the
		// src file to an absolute path (which we do using a browserify global transform), and the second is
		// to resolve that absolute path to a url (which we do once we know all our package ids).

		browserifyInstance.transform( function( file ) {
			// replace relative ##urls with absolute ones
			return replaceStringTransform( file, {
				find : /##asset_url\(\ *(['"])([^']*)\1\ *\)/,
				replace : function( file, wholeMatch, quote, assetSrcPath ) {
					var assetSrcAbsPath;

					try {
						assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
					} catch ( err ) {
						return _this.emit( 'error', new Error( 'Could not resolve ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
					}

					return '##asset_url(' + quote + assetSrcAbsPath + quote + ')';
				}
			} );
		} );

		_this.emit( 'browserifyInstanceCreated', browserifyInstance, mainPath );
	} );

	p.on( 'packageCreated', function( newPackage, isMain ) {
		if( isMain ) {
			thisParcel = newPackage;
			_this.addToParcelMap( thisParcel, thisParcel.id );
		}

		_this.packagePathsToIds[ newPackage.path ] = newPackage.id;

		newPackage.addTransform( assetUrlTransform, {
			packagePathsToIds : _this.packagePathsToIds,
			outputDirUrl : _this.outputDirUrl
		}, 'style' );

		newPackage.addTransform( replaceStringTransform, {
			find: /url\(\s*[\"\']?([^)\'\"]+)\s*[\"\']?\s*\)/g,
			replace : function( file, match, theUrl ) {
				theUrl = theUrl.trim();

				// absolute urls stay the same.
				if( theUrl.charAt( 0 ) === '/' ) return match;
				if( theUrl.indexOf( 'data:' ) === 0 ) return match; // data url, don't mess with this

				var cssFilePathRelativeToPackageDir = path.relative( newPackage.path, file );
				var cssFileDirPathRelativeToPackageDir = path.dirname( '/' + cssFilePathRelativeToPackageDir );
				if( cssFileDirPathRelativeToPackageDir !== '/' ) cssFileDirPathRelativeToPackageDir += '/';

				// urls in css files are relative to the css file itself
				var absUrl = url.resolve( cssFileDirPathRelativeToPackageDir, theUrl );
				absUrl = _this.outputDirUrl + newPackage.id + absUrl;

				return 'url( \'' + absUrl + '\' )';
			}
		}, 'style' );

		_this.writeIndividualAssetsToDisk( newPackage, assetTypesToWriteToDisk, function( err ) {
			if( err ) return _this.emit( 'error', err );

			_this.emit( 'packageCreated', newPackage, isMain );
		} );
	} );

	p.on( 'bundleWritten', function( bundlePath, assetType, watchModeUpdate ) {
		if( watchModeUpdate ) {
			var oldBundlePath = _this.finalBundlesByParcelId[ thisParcel.id ] && _this.finalBundlesByParcelId[ thisParcel.id ][ assetType ];
			if( oldBundlePath )	{
				fs.unlinkSync( oldBundlePath );
				delete _this.finalBundlesByParcelId[ thisParcel.id ][ assetType ];
			}

			_this.copyBundlesToParcelDiretory( thisParcel, _.object( [ assetType ], [ bundlePath ] ), function( err, finalBundles ) {
				if( err ) return _this.emit( 'error', err );

				_.each( finalBundles, function( thisBundle, thisBundleType ) { _this.emit( 'fileWritten', thisBundle, thisBundleType, true, true ); } );
			
				_this.writeAssetsJsonForParcel( thisParcel, assetTypes, assetTypesToConcatenate, function( err ) {
					if( err ) return _this.emit( 'error', err );

					// done!
				} );
			} );
		}
	} );

	p.on( 'done', function() {
		_this.copyBundlesToParcelDiretory( thisParcel, tempBundles, function( err, finalBundles ) {
			if( err ) return _this.emit( 'error', err );

			_.each( finalBundles, function( thisBundle, thisBundleType ) {
				_this.emit( 'fileWritten', thisBundle, thisBundleType, true, false );
			} );
			
			_this.writeAssetsJsonForParcel( thisParcel, assetTypes, assetTypesToConcatenate, function( err ) {
				if( err ) return _this.emit( 'error', err );

				callback();
			} );
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
				_this.writeAssetsJsonForParcel( thisParcel, assetTypes, assetTypesToConcatenate, function( err ) {
					if( err ) return _this.emit( 'error', err );

					nextSeries();
				} );
			} ], function( err ) {
				if( err ) return _this.emit( 'error', err );

				// done
			} );
		} );

		p.on( 'packageJsonUpdated', function( thePackage ) {
			_this.writeIndividualAssetsToDisk( thePackage, assetTypesToWriteToDisk, function( err ) {
				if( err ) return _this.emit( 'error', err );

				if( _this.parcelsDirPath && ( ! ( thePackage instanceof Parcel ) && thePackage === thisParcel ) ) {
					// if any package is converted to a parcel, we need to re-process the package (as a parcel).
					// (note the reverse is not true.. we don't need to reprocess parcels if they are "demoted" to packages)
					parcelFinder.parsePackage( thePackage.path, _this.parcelsDirPath, _this.packageTransform, function( err, isParcel, pkg ) {
						if( isParcel && _this.packageManifest[ thePackage.id ] === thePackage ) {
							var oldDependentParcels = thePackage.dependentParcels;

							delete _this.packageManifest[ thePackage.id ];
							thePackage.destroy();

							log.warn( '', 'Recreating package at ' + thePackage.path + ' as Parcel.' );

							_this.processMain( pkg.__mainPath, function() {
								oldDependentParcels.forEach( function( thisDependentParcel ) {
									thisDependentParcel.calcSortedDependencies();
									thisDependentParcel.calcParcelAssets( assetTypes );
								} );
							} );
						}
					} );
				}
			} );
		} );
	}
};

Cartero.prototype.findMainPaths = function( packageTransform, callback ) {
	parcelFinder( this.parcelsDirPath, { packageTransform : packageTransform }, function( err, detected ) {
		if (err) return callback( err );

		callback( null, _.reduce( detected, function( memo, thisPkg ) {
			return memo.concat( thisPkg.__mainPath );
		}, [] ) );
	} );
};

Cartero.prototype.copyBundlesToParcelDiretory = function( parcel, tempBundles, callback ) {
	var _this = this;
	var outputDirPath = this.getPackageOutputDirectory( parcel );
	var parcelBaseName = path.basename( parcel.path );
	var finalBundles = {};

	mkdirp( outputDirPath, function( err ) {
		if( err ) return( err );

		async.each( Object.keys( tempBundles ), function( thisAssetType, nextAssetType ) {
			var thisBundleTempPath = tempBundles[ thisAssetType ];
			if( ! thisBundleTempPath ) return nextAssetType();

			fs.exists( thisBundleTempPath, function( bundleExists ) {
				if( ! bundleExists ) {
					log.info( '', 'no ' + thisAssetType + ' assets exist for parcel "' + path.relative( process.cwd(), parcel.path ) + '"' );
					return nextAssetType(); // maybe there were no assets of this type
				}

				var bundleStream = fs.createReadStream( thisBundleTempPath );
				var bundleShasum;

				bundleStream.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
					bundleShasum = buf.toString( 'hex' );
					
					var dstPath = path.join( outputDirPath, parcelBaseName + '_bundle_' + bundleShasum + path.extname( thisBundleTempPath ) );
					bundleStream = fs.createReadStream( thisBundleTempPath );

					// this is part of a hack to apply the ##url transform to javascript files. see comments in transforms/resolveRelativeAssetUrlsToAbsolute
					var postProcessorsToApply = _.clone( _this.postProcessors );
					if( thisAssetType === 'script' ) postProcessorsToApply.push( function( file ) { return assetUrlTransform( file, {
						packagePathsToIds : _this.packagePathsToIds,
						outputDirUrl : _this.outputDirUrl
					} ); } );

					if( postProcessorsToApply.length !== 0 ) {
						// apply post processors
						bundleStream = bundleStream.pipe( combine.apply( null, postProcessorsToApply.map( function( thisPostProcessor ) {
							return thisPostProcessor( dstPath );
						} ) ) );
					}

					bundleStream.pipe( fs.createWriteStream( dstPath ).on( 'close', function() {
						// log.info( _this.watching ? 'watch' : '',
						// 	'%s bundle written for parcel "%s"',
						// 	thisAssetType, './' + path.relative( process.cwd(), parcel.path )
						// );
						
						fs.unlink( thisBundleTempPath, function() {} );
						nextAssetType();
					} ) );

					finalBundles[ thisAssetType ] = dstPath;

					if( ! _this.finalBundlesByParcelId[ parcel.id ] ) _this.finalBundlesByParcelId[ parcel.id ] = {};
					_this.finalBundlesByParcelId[ parcel.id ][ thisAssetType ] = dstPath;
				} ) );
			} );
		}, function( err ) {
			if( err ) return callback( err );

			return callback( null, finalBundles );
		} );
	} );
};

Cartero.prototype.writeAssetsJsonForParcel = function( parcel, assetTypes, assetTypesToConcatenate, callback ) {
	var _this = this;
	var bundles = _this.finalBundlesByParcelId[ parcel.id ];

	var content = {};

	if( bundles && bundles.script )
		content.script = [ path.relative( _this.outputDirPath, bundles.script ) ];

	_.without( assetTypes, 'script' ).forEach( function( thisAssetType ) {
		var concatenateThisAssetType = _.contains( assetTypesToConcatenate, thisAssetType );

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
		resolve( thisPostProcessorName, { basedir : process.cwd() }, function( err, modulePath ) {
			if( err ) return nextPostProcessorName( err );

			nextPostProcessorName( null, require( modulePath ) );
		} );
	}, callback );
};

Cartero.prototype.writeIndividualAssetsToDisk = function( thePackage, assetTypesToWriteToDisk, callback ) {
	var _this = this;
	var pathsOfWrittenAssets = [];
	var outputDirectoryPath = this.getPackageOutputDirectory( thePackage );

	assetTypesToWriteToDisk = _.intersection( assetTypesToWriteToDisk, Object.keys( thePackage.assetsByType ) );

	async.each( assetTypesToWriteToDisk, function( thisAssetType, nextAssetType ) {
		async.each( thePackage.assetsByType[ thisAssetType ], function( thisAsset, nextAsset ) {
			var thisAssetDstPath = path.join( outputDirectoryPath, path.relative( thePackage.path, thisAsset.srcPath ) );
			if( thisAssetType === 'style' ) thisAssetDstPath = renameFileExtension( thisAssetDstPath, '.css' );

			pathsOfWrittenAssets.push( thisAssetDstPath );

			thisAsset.writeToDisk( thisAssetDstPath, function( err ) {
				if( err ) return nextAsset( err );

				_this.applyPostProcessorsToFiles( [ thisAssetDstPath ], function( err ) {
					if( err ) return nextAsset( err );

					_this.emit( 'fileWritten', thisAssetDstPath, thisAssetType, false, _this.watching );
					
					if( _this.watching ) _this.writeMetaDataFile( function() {} );

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

Cartero.prototype.addToParcelMap = function( parcel, parcelId ) {
	//var parcelPathHash = crypto.createHash( 'sha1' ).update( parcelPathHash ).digest( 'hex' );
	this.parcelMap[ parcel.path ] = parcelId;
};

Cartero.prototype.writeMetaDataFile = function( callback ) {
	var _this = this;

	var metaDataFilePath = path.join( _this.outputDirPath, kMetaDataFileName );
	
	var packageMap = _.reduce( _this.packagePathsToIds, function( memo, thisPackageId, thisPackagePath ) {
		var thisPackageKey = thisPackagePath;

		// parcels need to take precedence over packages. if we have a situation where one package has
		// multiple incarnations and one is a parcel, we have to make sure the parcel takes precedence.
		// note that if we had a situation where there was more than one incarnation as a parcel, we
		// might run into problems. can cross that bridge when we get to it...
		if( _this.parcelMap[ thisPackagePath ] ) thisPackageId = _this.parcelMap[ thisPackagePath ];
		
		//thisPackageKey = crypto.createHash( 'sha1' ).update( thisPackageKey ).digest( 'hex' );
		memo[ thisPackageKey ] = thisPackageId;
		return memo;
	}, {} );

	_.extend( packageMap, this.parcelMap ); 

	var metaData = JSON.stringify( {
		formatVersion : 1,
		packageMap : packageMap
	}, null, 4 );

	fs.writeFile( metaDataFilePath, metaData, function( err ) {
		if( err ) return callback( err );

		callback();
	} );
};

/********************* Utility functions *********************/

function renameFileExtension( file, toExt ) {
	return file.replace( new RegExp( path.extname( file ) + "$" ), toExt );
}