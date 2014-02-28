var cartero = require( '../../cartero' );
var path = require( 'path' );

var kViewsDirPath = path.join( __dirname, 'views' );
var kStaticDirPath = path.join( __dirname, 'static' );

var kCarteroOptions = {
};

cartero( kViewsDirPath, path.join( kStaticDirPath, 'assets' ), kCarteroOptions, false, function() {
	console.log( 'done' );
} );