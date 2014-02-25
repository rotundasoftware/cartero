var cartero = require( '../../cartero' );
var path = require( 'path' );

var kViewsDirPath = path.join( __dirname, 'views' );
var kStaticDirPath = path.join( __dirname, 'static' );

var kCarteroOptions = {
	// packageAssetDefaults : {
	// 	style : '*.css'
	// }
};

cartero( kViewsDirPath, path.join( kStaticDirPath, 'assets' ), kCarteroOptions, false, function() {
	console.log( 'done' );
} );