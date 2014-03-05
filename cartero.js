
var _ = require( 'underscore' );
var fs = require( 'fs' );
var glob = require( 'glob' );
var path = require( 'path' );
var rimraf = require( "rimraf" );
var async = require( "async" );

var parcelDetector = require( 'parcel-detector' );
var parcelProcessor = require( 'parcel-processor' );

var kViewMapName = "view_map.json";

var mViewMap = {};
var mPackageManifest = {};
var mAssetManifest = {};

module.exports = function( viewDirectoryPath, outputDirectoryPath, carteroOptions, devMode, callback ) {
	carteroOptions = _.defaults( {}, carteroOptions, {
		'asset-types' : [ 'style', 'image', 'template' ],
		'package-defaults' : {
			style : null,
			image : null,
			template : null
		},
		'package-extends' : {}
	} );

	if( _.isUndefined( devMode ) ) devMode = false;

	// clear the output directory before proceeding (sync for now...)
	rimraf.sync( outputDirectoryPath );

	parcelDetector( viewDirectoryPath, function( err, detected ) {
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
				if (--pending === 0) withMains( mains );
			}
		});

	});

	function withMains( mains ) {
		var processorOptions = {
			dst : outputDirectoryPath,
			keys : carteroOptions[ 'asset-types' ],
			defaults : carteroOptions[ 'package-defaults' ],
			concatinateCss : ! devMode
		};

		async.each( mains, function( thisMain, nextMain ) {
			parcelProcessor( thisMain, processorOptions, function( err, packageRegistry, parcelId ) {
				if( err ) return nextMain( err );

				_.defaults( mPackageManifest, packageRegistry );
				mViewMap[ packageRegistry[ parcelId ].view ] = parcelId;

				nextMain();
			} );
		}, function( err ) {
			if( err ) return callback( err );

			var viewMapPath = path.join( outputDirectoryPath, kViewMapName );

			fs.writeFile( viewMapPath, JSON.stringify( mViewMap, null, 4 ), function( err ) {
				if( err ) return callback( err );

				callback();
			} );
		} );
	}
};