var os = require( 'os' );
var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );
var crypto = require( 'crypto' );

test( 'page1', function( t ) {
	t.plan( 4 );

	var viewDirPath = path.join( __dirname, 'example1/views' );
	var dstDir = path.join( __dirname, 'example1/static/assets' );
	var packageId, viewRelativePathHash;

	var c = cartero( viewDirPath, dstDir, {}, false );

	c.on( 'package', function( newPackage ) {
		packageId = newPackage.id;
		viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ packageId, 'view_map.json' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + packageId +'\"\n}' );
	
		t.deepEqual(
			fs.readdirSync( path.join( dstDir, packageId ) ).sort(),
			[ 'assets.json', 'page1_bundle_7cf8a25be8aa1b450d5cae5c33ce7c11318b0c3f.css', 'page1_bundle_9754e268aa7f9a43534c9986fdb3888a68071605.js' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, packageId, 'page1_bundle_7cf8a25be8aa1b450d5cae5c33ce7c11318b0c3f.css' ), 'utf8' ),
			'body {\n\tcolor: #00FF00;\n}' );
	} );
} );

test( 'page2', function( t ) {
	t.plan( 4 );

	var viewDirPath = path.join( __dirname, 'example2/views' );
	var dstDir = path.join( __dirname, 'example2/static/assets' );
	var packageId, viewRelativePathHash;
	var browserifyShimConfig = require( './example2/browserifyShimConfig' );

	var options = {
		packageTransform : function( pkg ) {
			_.defaults( pkg, {
				'style' : '*.css',
				'browserify-shim' : browserifyShimConfig
			} );

			switch( pkg.name ) {
				case 'jqueryui-browser':
					pkg.main = './ui/jquery-ui.js';
					pkg.style = [ './themes/base/jquery-ui.css' ];
					break;
			}

			return pkg;
		}
	};

	var c = cartero( viewDirPath, dstDir, options, false );

	c.on( 'package', function( newPackage ) {
		packageId = newPackage.id;
		viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ packageId, 'view_map.json' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + packageId + '\"\n}' );
	
		t.deepEqual(
			fs.readdirSync( path.join( dstDir, packageId ) ).sort(),
			[ 'assets.json', 'page1_bundle_4f6f65733a9cc9d0a834e03189afc59b2d769ff5.css', 'page1_bundle_f63fdc9b8dde040c6f06bd739d1f0b2b26fa7000.js' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, packageId, 'page1_bundle_4f6f65733a9cc9d0a834e03189afc59b2d769ff5.css' ), 'utf8' ),
			'body {\n\tbackground : blue;\n}' );
	} );
} );