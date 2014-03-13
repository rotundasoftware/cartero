var os = require( 'os' );
var cartero = require( '../index' );
var path = require( 'path' );
var test = require( 'tape' );
var fs = require( 'fs' );

test( 'page1', function( t ) {
	t.plan( 4 );

	var viewsDir = path.join( __dirname, 'example1/views' );
	var dstDir = path.join( __dirname, 'example1/static/assets' );

	var c = cartero( viewsDir, dstDir, {}, false );
	c.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ '8495f2ddc31efcbc486996dff29616fbc0764ba5', 'view_map.json' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, 'view_map.json' ), 'utf8' ), '{\n    \"9c0accfceb2bac987d5ec3367129df02bb6f098e\": \"8495f2ddc31efcbc486996dff29616fbc0764ba5\"\n}' );

	
		t.deepEqual(
			fs.readdirSync( path.join( dstDir, '8495f2ddc31efcbc486996dff29616fbc0764ba5' ) ).sort(),
			[ 'assets.json', 'page1_bundle_7cf8a25be8aa1b450d5cae5c33ce7c11318b0c3f.css', 'page1_bundle_9754e268aa7f9a43534c9986fdb3888a68071605.js' ]
		);

		t.deepEqual( fs.readFileSync( path.join( dstDir, '8495f2ddc31efcbc486996dff29616fbc0764ba5', 'page1_bundle_7cf8a25be8aa1b450d5cae5c33ce7c11318b0c3f.css' ), 'utf8' ),
			'body {\n\tcolor: #00FF00;\n}' );
	} );
} );