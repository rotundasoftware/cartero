
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
var through = require('through');
var through2 = require('through2');
var combine = require( "stream-combiner" );
var pathMapper = require( "path-mapper" );
var resolve = require( "resolve" );

var parcelDetector = require( 'parcel-detector' );
var parcelify = require( 'parcelify' );

var kViewMapName = "view_map.json";
var kPackageMapName = "package_map.json";
var kAssetsJsonName = "assets.json";

module.exports = Cartero;

inherits( Cartero, EventEmitter );

function Cartero( viewDirPath, outputDirPath, options ) {
	if( ! ( this instanceof Cartero ) ) return new Cartero( viewDirPath, outputDirPath, options );

	var _this = this;

	options = _.defaults( {}, options, {
		assetTypes : [ 'style', 'template', 'image' ],
		assetTypesToConcatinate : [ 'style', 'template' ],
		sourceMaps : false,
		watch : false,
		postProcessors : [],
		outputDirUrl : '/',

		packageTransform : undefined
	} );

	this.viewDirPath = viewDirPath;
	this.outputDirPath = outputDirPath;
	this.outputDirUrl = options.outputDirUrl;

	this.packageManifest = {};
	this.finalBundlesByParcelId = {};

	this.viewMap = {};
	this.packagePathsToIds = {};

	var assetTypes = options.assetTypes;
	var tempBundlesByMain = {};
	var assetTypesToConcatenate = options.keepSeperate ? [] : [ 'style' ];
	var postProcessors;

	this.assetUrlTransform_resolveToAbsPath = _.bind( this.assetUrlTransform_resolveToAbsPath, this );
	this.assetUrlTransform = _.bind( this.assetUrlTransform, this );

	async.series( [ function( nextSeries ) {
		// delete the output directory
		rimraf( outputDirPath, nextSeries );
	}, function( nextSeries ) {
		// now remake it
		fs.mkdir( outputDirPath, nextSeries );
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
				style : _.contains( assetTypesToConcatenate, 'style' ) ? _this.getTempBundlePath( 'css' ) : null,
				//template : _.contains( options.assetTypesToConcatenate, 'template' ) ? _this.getTempBundlePath( 'tmpl' ) : null
				image : null
			};

			var parcelifyOptions = {
				bundles : tempBundlesByMain[ thisMain ],
				watch : options.watch,
				browserifyBundleOptions : {
					packageFilter : options.packageTransform,
					debug : options.sourceMaps
				},
				existingPackages : _this.packageManifest
			};

			var p = parcelify( thisMain, parcelifyOptions );
			var thisParcel;

			p.on( 'browerifyInstanceCreated', function( browserifyInstance ) {
				browserifyInstance.transform( _this.assetUrlTransform_resolveToAbsPath );
			} );

			p.on( 'packageCreated', function( newPackage, isMain ) {
				if( isMain ) thisParcel = newPackage;

				_this.packagePathsToIds[ newPackage.path ] = newPackage.id;

				newPackage.getAssets().forEach( function( thisAsset ) {
					thisAsset.addTransform( _this.assetUrlTransform, true );
				} );

				var assetTypesToWriteToDisk = _.difference( assetTypes, options.assetTypesToConcatinate );

				newPackage.writeAssetsToDisk( assetTypesToWriteToDisk, _this.getPackageOutputDirectory( newPackage ), function( err, pathsOfWrittenAssets ) {
					_this.applyPostProcessorsToFiles( postProcessors, pathsOfWrittenAssets, function( err ) {
						if( err ) return _this.emit( 'error', err );

						pathsOfWrittenAssets.forEach( function( thisAssetPath ) { _this.emit( 'fileWritten', thisAssetPath, false ); } );

						_this.emit( 'packageCreated', newPackage, isMain );
					} );
				} );
			} );

			p.on( 'done', function() {
				_this.addToViewMap( thisParcel.view, thisParcel.id );

				_this.copyBundlesToParcelDiretory( thisParcel, tempBundlesByMain[ thisMain ], postProcessors, function( err, finalBundles ) {
					if( err ) return _this.emit( 'error', err );

					_.each( finalBundles, function( thisBundle, thisBundleType ) { _this.emit( 'fileWritten', thisBundle, thisBundleType, true, false ); } );
					
					_this.writeAssetsJsonForParcel( thisParcel, assetTypes, function( err ) {
						if( err ) return _this.emit( 'error', err );

						nextMain();
					} );
				} );
			} );

			p.on( 'bundleWritten', function( path, assetType, watchModeUpdate ) {
				if( watchModeUpdate ) {
					_this.copyBundlesToParcelDiretory( thisParcel, _.object( [ assetType ], [ path ] ), postProcessors, function( err, finalBundles ) {
						if( err ) return _this.emit( 'error', err );

						_.each( finalBundles, function( thisBundle, thisBundleType ) { _this.emit( 'fileWritten', thisBundle, thisBundleType, true, true ); } );
					
						_this.writeAssetsJsonForParcel( thisParcel, assetTypes, function( err ) {
							if( err ) return _this.emit( 'error', err );

							nextMain();
						} );
					} );
				}
			} );

			if( options.watch ) {
				p.on( 'assetUpdated', function( eventType, asset ) {
					this.writeAssetsJsonForParcel( thisParcel, assetTypes, function( err ) {
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
					if( thePackage === thisParcel )
						_this.addToViewMap( thisParcel.view, thisParcel.id );
				} );
			}
		}, nextSeries );
	} ], function( err ) {
		if( err ) return _this.emit( 'error', err );

		_this.writeViewAndPackageMaps( function( err ) {
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

					// this is part of a hack to apply the ##url transform to javascript files. see assetUrlTransform_resolveToAbsPath
					var postProcessorsToApply = _.clone( postProcessors );
					if( thisAssetType === 'script' ) postProcessorsToApply.push( _this.assetUrlTransform );

					if( postProcessorsToApply.length !== 0 ) {
						// apply post processors
						bundleStream = bundleStream.pipe( combine.apply( null, postProcessorsToApply.map( function( thisPostProcessor ) {
							return thisPostProcessor( dstPath );
						} ) ) );
					}

					bundleStream.pipe( fs.createWriteStream( dstPath ).on( 'close', function() {
						nextAssetType();
					} ) );

					finalBundles[ thisAssetType ] = dstPath;

					if( ! _this.finalBundlesByParcelId[ parcel.id ] ) _this.finalBundlesByParcelId[ parcel.id ] = {};
					_this.finalBundlesByParcelId[ parcel.id ][ thisAssetType ] = dstPath;

					fs.unlink( thisBundleTempPath, function() {} );
				} ) );
			} );
		}, function( err ) {
			if( err ) return callback( err );

			return callback( null, finalBundles );
		} );
	} );
};

Cartero.prototype.writeAssetsJsonForParcel = function( parcel, assetTypes, callback ) {
	var _this = this;
	var bundles = _this.finalBundlesByParcelId[ parcel.id ];
	var assetTypesToConcatinate = Object.keys( bundles );

	var content = {
		'script' : [ path.relative( _this.outputDirPath, bundles.script ) ]
	};

	_.without( assetTypes, 'script' ).forEach( function( thisAssetType ) {
		var concatenateThisAssetType = _.contains( assetTypesToConcatinate, thisAssetType );

		var filesOfThisType;
		if( concatenateThisAssetType ) filesOfThisType = bundles[ thisAssetType ] ? [ bundles[ thisAssetType ] ] : [];
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


Cartero.prototype.assetUrlTransform_resolveToAbsPath = function( file ) {
	var _this = this;

	// this is kind of a hack. the problem is that the only time we can apply transforms to individual javascript
	// files is using the browserify global transform. however, at the time those transforms are run we
	// do not yet know all our package ids, so we can't map the src path the the url yet. but we do need to
	// resolve relative paths at this time, because once the js files are bundled the tranform will be
	// passed a new path (that of the bundle), and we no longer be able to resolve those relative paths.
	// Therefore for the case of js files we do this transform in two phases. The first is to resolve the
	// src file to an absolute path (which we do using a browserify global transform), and the second is
	// to resolve that absolute path to a url (which we do once we know all our package ids).

	var data = '';

	return through( write, end );

	function write( buf ) {
		var res = buf.toString( 'utf8' );

		res = res.replace( /##url\(\ *(['"])([^']*)\1\ *\)/, function( wholeMatch, quote, assetSrcPath ) {
			try {
				assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
			} catch ( err ) {
				return _this.emit( 'error', new Error( 'Could not resolve ##url( "' + assetSrcPath + '" ) in file ' + file ) );
			}

			return '##url(' + quote + assetSrcAbsPath + quote + ')';
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};

Cartero.prototype.assetUrlTransform = function( file ) {
	var _this = this;

	var data = '';

	return through( write, end );

	function write( buf ) {
		var res = buf.toString( 'utf8' );

		res = res.replace( /##url\(\ *(['"])([^']*)\1\ *\)/, function( wholeMatch, quote, assetSrcPath ) {
			try {
				assetSrcAbsPath = resolve.sync( assetSrcPath, { basedir : path.dirname( file ) } );
			} catch ( err ) {
				return _this.emit( 'error', new Error( 'Could not resolve ##url( "' + assetSrcPath + '" ) in file "' + file + '"' ) );
			}

			var url = pathMapper( assetSrcAbsPath, function( srcDir ) {
				return _this.packagePathsToIds[ srcDir ] ? '/' + _this.packagePathsToIds[ srcDir ] : null; // return val of outputDirPath needs to be absolute path
			} );

			// all assets urls should be different than their paths.. otherwise we have a problem
			if( url === assetSrcAbsPath )
				return _this.emit( 'error', new Error( 'The file "' + assetSrcAbsPath + '" referenced from ##url( "' + assetSrcPath + '" ) in file "' + file + '" is not an asset.' ) );

			if( _this.outputDirUrl ) {
				var baseUrl = _this.outputDirUrl[0] === path.sep ? _this.outputDirUrl.slice(1) : _this.outputDirUrl;
				url = baseUrl + url;
			}

			return url;
		} );

		this.queue( new Buffer( res, 'utf8' ) );
	}

	function end() {
		this.queue( null );
	}
};

Cartero.prototype.addToViewMap = function( viewPath, parcelId ) {
	var viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( this.viewDirPath, viewPath ) ).digest( 'hex' );
	this.viewMap[ viewRelativePathHash ] = parcelId;
};

Cartero.prototype.writeViewAndPackageMaps = function( callback ) {
	var _this = this;

	async.parallel( [ function( nextParallel ) {
		var viewMapPath = path.join( _this.outputDirPath, kViewMapName );
		fs.writeFile( viewMapPath, JSON.stringify( _this.viewMap, null, 4 ), function( err ) {
			if( err ) return callback( err );

			nextParallel();
		} );
	}, function( nextParallel ) {
		var packageMapPath = path.join( _this.outputDirPath, kPackageMapName );
		var packageMap = _.reduce( _this.packagePathsToIds, function( memo, thisPackageId, thisPackagePath ) {
			var thisPackagePathShasum = crypto.createHash( 'sha1' ).update( thisPackagePath ).digest( 'hex' );
			memo[ thisPackagePathShasum ] = thisPackageId;
			return memo;
		}, {} );

		fs.writeFile( packageMapPath, JSON.stringify( packageMap, null, 4 ), function( err ) {
			if( err ) return callback( err );

			nextParallel();
		} );
	} ], callback );
};
