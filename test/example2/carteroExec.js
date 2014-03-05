var cartero = require( '../../cartero' );
var path = require( 'path' );

var kViewsDirPath = path.join( __dirname, 'views' );
var kStaticDirPath = path.join( __dirname, 'static' );

var kCarteroOptions = require( './carteroConfig.json' );

cartero( kViewsDirPath, path.join( kStaticDirPath, 'assets' ), kCarteroOptions, true, function( err ) {
	if( err ) throw err;

	console.log( 'done' );
} );