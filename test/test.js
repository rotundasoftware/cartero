var os = require( 'os' );
var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );
var crypto = require( 'crypto' );
var _ = require( 'underscore' );

// test( 'page1', function( t ) {
// 	t.plan( 4 );

// 	var viewDirPath = path.join( __dirname, 'example1/views' );
// 	var dstDir = path.join( __dirname, 'example1/static/assets' );
// 	var packageId, viewRelativePathHash;

// 	var c = cartero( viewDirPath, dstDir, {} );

// 	c.on( 'packageCreated', function( newPackage, isMain ) {
// 		if( isMain ) {
// 			packageId = newPackage.id;
// 			viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
// 		}
// 	} );

// 	c.on( 'done', function() {
// 		t.deepEqual(
// 			fs.readdirSync( dstDir ).sort(),
// 			[ packageId, 'view_map.json' ]
// 		);

// 		t.deepEqual( fs.readFileSync( path.join( dstDir, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + packageId +'\"\n}' );
	
// 		t.deepEqual(
// 			fs.readdirSync( path.join( dstDir, packageId ) ).sort(),
// 			[ 'assets.json', 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css', 'page1_bundle_d4d3df760297139ea6f4ec7b2296537fe86efe67.js' ]
// 		);

// 		t.deepEqual( fs.readFileSync( path.join( dstDir, packageId, 'page1_bundle_9238125c90e5cfc790e8a5ac8926185dfb162b8c.css' ), 'utf8' ),
// 			'body {\n\tcolor : blue;\n}body {\n\tcolor : red;\n}body {\n\tcolor: #00FF00;\n}' );
// 	} );
// } );

test( 'page2', function( t ) {
	t.plan( 3 );

	var viewDirPath = path.join( __dirname, 'example2/views' );
	var dstDir = path.join( __dirname, 'example2/static/assets' );
	var parcelId, viewRelativePathHash;

	var options = {
		packageTransform : function( pkg ) {
			_.defaults( pkg, {
				'style' : '*.css',
				'browserify' : {
					'transform' : [ 'browserify-shim' ]
				}
			} );

			switch( pkg.name ) {
				case 'jqueryui-browser':
					pkg.main = 'ui/jquery-ui.js';
					pkg.style = [ './themes/base/jquery-ui.css' ];
					break;
			}

			return pkg;
		}
	};

	var c = cartero( viewDirPath, dstDir, options );

	c.on( 'packageCreated', function( newPackage ) {
		if( newPackage.isParcel ) {
			parcelId = newPackage.id;
			viewRelativePathHash = crypto.createHash( 'sha1' ).update( path.relative( viewDirPath, newPackage.view ) ).digest( 'hex' );
		}
	} );

	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ parcelId, 'view_map.json' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, 'view_map.json' ), 'utf8' ), '{\n    \"' + viewRelativePathHash + '\": \"' + parcelId + '\"\n}' );
	
		t.deepEqual(
			fs.readdirSync( path.join( dstDir, parcelId ) ).sort(),
			[ 'assets.json', 'page1_bundle_064a5a429df0fffa17bb17089edcc71d62381f93.css', 'page1_bundle_74ce1438ec3bf6617184fabd02cef6771fc355aa.js' ]
		);
	} );
} );