
var _ = require( 'underscore' );
var fs = require( 'fs' );
var glob = require( 'glob' );
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

var kParcelMapName = "parcel_map.json";
var kPackageMapName = "package_map.json";
var kAssetsJsonName = "assets.json";

module.exports = Cartero;

inherits( Cartero, EventEmitter );

function Cartero( viewsDirPath, outputDirPath, options ) {
	if( ! ( this instanceof Cartero ) ) return new Cartero( viewsDirPath, outputDirPath, options );

	var _this = this;

	if( ! viewsDirPath ) throw new Error( 'Required argument viewDirPath was not supplied.' );
	if( ! outputDirPath ) throw new Error( 'Required argument outputDirPath was not supplied.' );

	this.viewsDirPath = path.resolve( path.dirname( require.main.filename ), viewsDirPath );
	this.outputDirPath = path.resolve( path.dirname( require.main.filename ), outputDirPath );

	options = _.defaults( {}, options, {
		assetTypes : [ 'style', 'image' ],
		assetTypesToConcatenate : [ 'style' ],
	
		appTranforms : [],
		appTranformDirs : [ this.viewsDirPath ],

		outputDirUrl : '/',
		packageTransform : undefined,

		sourceMaps : false,
		watch : false,
		postProcessors : [],

		browserifyOptions : {},
		browserifyBundleOptions: {}
	} );

	_.extend( this, _.pick( options,
		'assetTypes',
		'assetTypesToConcatenate',
		'appTranforms',
		'appTranformDirs',
		'outputDirUrl',
		'packageTransform',
		'sourceMaps',
		'watch',
		'browserifyOptions',
		'browserifyBundleOptions'
	) );

	this.outputDirUrl = options.outputDirUrl;

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
	}, function( nextSeries ) {
		_this.processParcels( nextSeries );
	} ], function( err ) {
		if( err ) return _this.emit( 'error', err );

		if( options.watch ) {
			var parcelJsonWatcher = globwatcher( path.join( _this.viewsDirPath, "/**/package.json" ) );
			parcelJsonWatcher.on( 'added', _this.processParcels );
			parcelJsonWatcher.on( 'changed', _this.processParcels );

			_this.watching = true;
			log.info( 'watching for changes...' );
		}

		_this.emit( 'done' );
	} );

	return _this;
}

Cartero.prototype.processParcels = function( callback ) {
	var _this = this;

	_this.findMainPaths( _this.packageTransform, function( err, newMains ) {
		if( err ) _this.emit( 'error', err );

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
			if( err ) return callback( err );

			_this.writeTopLevelMaps( function( err ) {
				if( err ) return callback( err );

				callback();
			} );
		} );
	} );
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
		appTranforms : _this.appTranforms,
		appTranformDirs : _this.appTranformDirs,
		packageTransform : _this.packageTransform,
		watch : _this.watch,
		browserifyOptions : _this.browserifyOptions,
		browserifyBundleOptions : _.extend( {}, {
			debug : _this.sourceMaps
		}, _this.browserifyBundleOptions ),
		existingPackages : _this.packageManifest
	};

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
					try {
						assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
					} catch ( err ) {
						return _this.emit( 'error', new Error( 'Could not resolve ##asset_url( "' + assetSrcPath + '" ) in file "' + file + '": ' + err ) );
					}

					return '##asset_url(' + quote + assetSrcAbsPath + quote + ')';
				}
			} );
		} );
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
		} );

		newPackage.addTransform( replaceStringTransform, {
			find: /url\(\s*[\"\']?([^)\'\"]+)\s*[\"\']?\s*\)/g,
			replace : function( file, match, url ) {
				url = url.trim();

				// absolute urls stay the same.
				if( url.charAt( 0 ) === '/' ) return match;

				var cssFilePathRelativeToPackageDir = path.relative( newPackage.path, file );

				// urls in css files are relative to the css file itself
				var absUrl = path.resolve( path.dirname( '/' + cssFilePathRelativeToPackageDir ), url );
				absUrl = '/' + newPackage.id + absUrl;

				return 'url( \'' + absUrl + '\' )';
			}
		}, 'style' );

		newPackage.writeAssetsToDisk( assetTypesToWriteToDisk, _this.getPackageOutputDirectory( newPackage ), function( err, pathsOfWrittenAssets ) {
			_this.applyPostProcessorsToFiles( pathsOfWrittenAssets, function( err ) {
				if( err ) return _this.emit( 'error', err );

				pathsOfWrittenAssets.forEach( function( thisAssetPath ) { _this.emit( 'fileWritten', thisAssetPath, false ); } );
				
				if( _this.watching ) _this.writeTopLevelMaps( function() {} );

				_this.emit( 'packageCreated', newPackage, isMain );
			} );
		} );
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

	_this.on( 'error', function( err ) {
		log.error( '', err );
	} );

	if( _this.watch ) {
		p.on( 'assetUpdated', function( eventType, asset ) {
			_this.writeAssetsJsonForParcel( thisParcel, assetTypes, assetTypesToConcatenate, function( err ) {
				if( err ) return _this.emit( 'error', err );

				if( _.contains( assetTypesToWriteToDisk, asset.type ) ) {
					if( eventType === 'added' || eventType === 'changed' )
						asset.writeToDisk( null, true, function() {
							_this.emit( 'fileWritten', asset.dstPath, asset.type, false, true );

							// ... done
						} );
					else
						fs.unlink( asset.dstPath, function( err ) { if( err ) _this.emit( 'error', err ); } );
				}
			} );
		} );

		p.on( 'packageJsonUpdated', function( thePackage ) {
			if( ! ( thePackage instanceof Parcel ) || thePackage === thisParcel ) {
				// if any package is converted to a parcel, we need to re-process the package (as a parcel).
				// (note the reverse is not true.. we don't need to reprocess parcels if they are "demoted" to packages)
				parcelFinder.parsePackage( thePackage.path, _this.packageTransform, function( err, isParcel, pkg ) {
					if( isParcel && _this.packageManifest[ thePackage.id ] === thePackage ) {
						delete _this.packageManifest[ thePackage.id ];
						thePackage.destroy();

						_this.processMain( pkg.__mainPath, function() {} );
					}
				} );
			}
			else if( thePackage === thisParcel )
				// in case the view key changed
				_this.addToParcelMap( thisParcel, thisParcel.id );
		} );
	}
};

Cartero.prototype.findMainPaths = function( packageTransform, callback ) {
	parcelFinder( this.viewsDirPath, { packageTransform : packageTransform }, function( err, detected ) {
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
				if( ! bundleExists ) return nextAssetType(); // maybe there were no assets of this type

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
						log.info( _this.watching ? 'watch' : '',
							'%s bundle written for %s',
							thisAssetType, path.relative( _this.viewsDirPath, parcel.view )
						);
						
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
	var viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( this.viewsDirPath, parcel.path ) ).digest( 'hex' );
	this.parcelMap[ viewRelativePathHash ] = parcelId;
};

Cartero.prototype.writeTopLevelMaps = function( callback ) {
	var _this = this;

	async.parallel( [ function( nextParallel ) {
		var parcelMapPath = path.join( _this.outputDirPath, kParcelMapName );
		fs.writeFile( parcelMapPath, JSON.stringify( _this.parcelMap, null, 4 ), function( err ) {
			if( err ) return callback( err );

			nextParallel();
		} );
	// }, function( nextParallel ) {
	// 	var packageMapPath = path.join( _this.outputDirPath, kPackageMapName );
	// 	var packageMap = _.reduce( _this.packagePathsToIds, function( memo, thisPackageId, thisPackagePath ) {
	// 		var thisPackagePathShasum = crypto.createHash( 'sha1' ).update( thisPackagePath ).digest( 'hex' );
	// 		memo[ thisPackagePathShasum ] = thisPackageId;
	// 		return memo;
	// 	}, {} );

	// 	fs.writeFile( packageMapPath, JSON.stringify( packageMap, null, 4 ), function( err ) {
	// 		if( err ) return callback( err );

	// 		nextParallel();
	// 	} );
	} ], callback );
};
