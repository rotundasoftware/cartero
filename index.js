
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

var parcelDetector = require( 'parcel-detector' );
var parcelify = require( 'parcelify' );

var kViewMapName = "view_map.json";
var kAssetsJsonName = "assets.json";
var kAssetTypes = [ 'style', 'image' ];

module.exports = Cartero;

inherits( Cartero, EventEmitter );

function Cartero( viewDirPath, dstDir, options ) {
	if( ! ( this instanceof Cartero ) ) return new Cartero( viewDirPath, dstDir, options );

	var _this = this;

	options = _.defaults( {}, options, {
		concatinateCss : true,
		debug : false,
		watch : false,
		postProcessors : [],

		packageFilter : undefined
	} );

	this.viewDirPath = viewDirPath;
	this.dstDir = dstDir;
	this.viewMap = {};
	this.packageManifest = {};
	this.assetTypes = kAssetTypes;

	var tempBundlesByMain = {};
	var assetTypesToConcatinate = options.concatinateCss ? [ 'style' ] : [];
	var postProcessors;

	async.series( [ function( nextSeries ) {
		// delete the output directory
		rimraf( dstDir, nextSeries );
	}, function( nextSeries ) {
		// now remake it
		fs.mkdir( dstDir, nextSeries );
	}, function( nextSeries ) {
		_this.findMainPaths( function( err, res ) {
			if( err ) return nextSeries( err );

			jsMains = res;
			nextSeries();
		} );
	}, function( nextSeries ) {
		_this.resolvePostProcessors( options.postProcessors, function( err, res ) {
			if( err ) return nextSeries( err );

			postProcessors = res;
			nextSeries();
		} );
	}, function( nextSeries ) {
		async.each( jsMains, function( thisMain, nextMain ) {
			tempBundlesByMain[ thisMain ] = {
				script : _this.getTempBundlePath( 'js' ),
				style : _.contains( assetTypesToConcatinate, 'style' ) ? _this.getTempBundlePath( 'css' ) : null,
				//template : _.contains( options.assetTypesToConcatinate, 'template' ) ? _this.getTempBundlePath( 'tmpl' ) : null
				image : null
			};

			var parcelifyOptions = {
				bundles : tempBundlesByMain[ thisMain ],
				watch : options.watch,
				browserifyBundleOptions : {
					packageFilter : options.packageFilter,
					debug : options.debug
				},
				existingPackages : _this.packageManifest
			};

			var p = parcelify( thisMain, parcelifyOptions );
			var thisParcel;

			p.on( 'packageCreated', function( newPackage, isMain ) {
				if( isMain ) thisParcel = newPackage;

				var assetTypesToWriteToDisk = _.difference( _this.assetTypes, assetTypesToConcatinate );

				newPackage.writeAssetsToDisk( assetTypesToWriteToDisk, _this.getPackageOutputDirectory( newPackage ), function( err, pathsOfWrittenAssets ) {
					_this.applyPostProcessorsToFiles( postProcessors, pathsOfWrittenAssets, function( err ) {
						if( err ) return _this.emit( 'error', err );

						_this.emit( 'packageCreated', newPackage, isMain );
					} );
				} );
			} );

			p.on( 'done', function() {
				_this.copyBundlesToParcelDiretory( thisParcel, tempBundlesByMain[ thisMain ], postProcessors, function( err, finalBundles ) {
					if( err ) return _this.emit( 'error', err );

					_.each( finalBundles, function( thisBundle, thisBundleType ) { _this.emit( 'bundle', thisBundle, thisBundleType ); } );
					
					_this.writeAssetsJsonForParcel( thisParcel, assetTypesToConcatinate, finalBundles, function( err ) {
						if( err ) return _this.emit( 'error', err );

						var viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, thisParcel.view ) ).digest( 'hex' );
						_this.viewMap[ viewRelativePathHash ] = thisParcel.id;

						nextMain();
					} );
				} );
			} );

			if( options.watch )
				p.on( 'assetUpdated', function( eventType, asset ) {
					this.writeAssetsJsonForParcel( thisParcel, function( err ) {
						if( err ) return _this.emit( 'error', err );

						if( _.contains( assetTypesToWriteToDisk, asset.type ) ) asset.writeToDisk( null, true, function() {
							// ... done
						} );
					} );
				} );
		}, nextSeries );
	} ], function( err ) {
		if( err ) return _this.emit( 'error', err );

		var viewMapPath = path.join( dstDir, kViewMapName );

		fs.writeFile( viewMapPath, JSON.stringify( _this.viewMap, null, 4 ), function( err ) {
			if( err ) return _this.emit( 'error', err );

			_this.emit( 'done' );
		} );
	} );

	return _this;
}

Cartero.prototype.findMainPaths = function( callback ) {
	parcelDetector( this.viewDirPath, function( err, detected ) {
		if (err) return callback( err );

		var keys = Object.keys(detected);
		var pending = keys.length;
		var mains = [];

		keys.forEach(function (key) {
			var pkg = detected[key];
			var pkgdir = path.dirname(key);

			if (pkg.browser && typeof pkg.browser === 'string') {
				return set(pkg.browser);
			}
			if (pkg.main && pkg.browser) {
				var bkeys = Object.keys(pkg.browser).map(function (k) {
					return path.relative('.', k);
				});
				var ix = bkeys.indexOf(pkg.main);
				if (ix >= 0) return set(bkeys[i]);
			}
			if (pkg.main) return set(pkg.main);

			var main = path.resolve(pkgdir, 'index.js');
			fs.exists(main, function (ex) {
				if (ex) set('index.js');
				else set();
			});

			function set (x) {
				if (x) mains.push(path.resolve(pkgdir, x));
				if (--pending === 0) callback( null, mains );
			}
		});
	});
};

Cartero.prototype.copyBundlesToParcelDiretory = function( parcel, tempBundles, postProcessors, callback ) {
	var dstDir = this.getPackageOutputDirectory( parcel );
	var parcelBaseName = path.basename( parcel.path );
	var finalBundles = {};

	mkdirp( dstDir, function( err ) {
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
					
					var dstPath = path.join( dstDir, parcelBaseName + '_bundle_' + bundleShasum + path.extname( thisBundleTempPath ) );
					bundleStream = fs.createReadStream( thisBundleTempPath );

					if( postProcessors.length !== 0 ) {
						// apply post processors
						bundleStream = bundleStream.pipe( combine.apply( null, postProcessors.map( function( thisPostProcessor ) {
							return thisPostProcessor( dstPath );
						} ) ) );
					}

					bundleStream.pipe( fs.createWriteStream( dstPath ).on( 'close', function() {
						nextAssetType();
					} ) );

					finalBundles[ thisAssetType ] = dstPath;

					fs.unlink( thisBundleTempPath, function() {} );
				} ) );
			} );
		}, function( err ) {
			if( err ) return callback( err );

			return callback( null, finalBundles );
		} );
	} );
};

Cartero.prototype.writeAssetsJsonForParcel = function( parcel, assetTypesToConcatinate, bundles, callback ) {
	var _this = this;

	var content = {
		'script' : [ path.relative( _this.dstDir, bundles.script ) ]
	};

	// we assume script and style assets are the only ones we need to put in assets.json, ever.
	[ 'script', 'style' ].forEach( function( thisAssetType ) {
		var concatinateThisAssetType = _.contains( assetTypesToConcatinate, thisAssetType );

		var filesOfThisType;
		if( concatinateThisAssetType ) filesOfThisType = bundles[ thisAssetType ] ? [ bundles[ thisAssetType ] ] : [];
		else filesOfThisType = _.pluck( parcel.parcelAssetsByType[ thisAssetType ], 'dstPath' );

		content[ thisAssetType ] = _.map( filesOfThisType, function( absPath ) {
			return path.relative( _this.dstDir, absPath );
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
	return path.join( this.dstDir, thePackage.id );
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

Cartero.prototype.applyPostProcessorsToFiles = function( postProcessors, filePaths, callback ) {
	if( postProcessors.length === 0 ) return callback();

	async.each( filePaths, function( thisFilePath, nextFilePath ) {
		var stream = fs.createReadStream( thisFilePath );
		var throughStream;

		stream = stream.pipe( combine.apply( null, postProcessors.map( function( thisPostProcessor ) {
			return thisPostProcessor( thisFilePath );
		} ) ) );

		stream.on( 'end', function() {
			throughStream.pipe( fs.createWriteStream( thisFilePath ).on( 'close', nextFilePath ) );
		} );

		throughStream = stream.pipe( through2() );
	}, callback );
};