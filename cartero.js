
var _ = require( 'underscore' );
var fs = require( 'fs' );
var path = require('path');

var browserify = require( 'browserify' );
var parcelDetector = require( 'parcel-detector' );
var parcelProcessor = require( 'parcel-detector' );

var kViewMapName = "view_map.json";

var mViewMap = {};
var mParcelManifest = {};
var mAssetManifest = {};

modules.exports = function( viewDirectoryPath, outputDirecotryPath, cateroOptions, prodMode, done ) {
	cateroOptions = _.defaults( {}, cateroOptions, {
		styleTransforms : [],
		javascriptPost : [],
		stylePost : [],
		assetDefaults : {}
	} );

	detect( viewDirectoryPath, function (err, detected) {
		if (err) return done(err);

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
			dst : outputDirecotryPath,
			keys : [ 'style', 'images', 'templates' ],
			defaults : carteroOptions.assetDefaults
		};

		var pending = mains.length;
		_.each( mains, function( thisMain ) {
			processorEmitter = parcelProcessor( browserify( thisMain ), processorOptions );

			processorEmitter.on( "package", function( packageInfo ) {
				mParcelManifest[ packageInfo.id ] = packageInfo;

				var viewRelativePath = packageInfo.package.view;
				var viewAbsPath = path.join( packageInfo.path, viewRelativePath );
				mViewMap[ viewAbsPath ] = packageInfo.id;
			} );

			processorEmitter.on( "map", function( map ) {
				_.extend( mAssetManifest, map );
			} );

			processorEmitter.on( "done", function() {
				if( --pending === 0 ) {
					// we've finished processing all parcels. basically home free.
					
					// just need to write the view_map to the output directory.
					var viewMapPath = path.join( outputDirecotryPath, kViewMapName );

					fs.writeFile( viewMapPath, JSON.stringify( mViewMap, null, 4 ), function( err ) {
						if( err ) return done( err );

						done();
					} );
				}
			} );
		} );
	}
};