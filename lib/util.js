var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" ),
	File = require( "./file" );

var kCarteroJsonFile = "cartero.json";

function mapAssetFileName( fileName, assetExtensionMap ) {

	var fileExt = File.getFileExtension( fileName );

	var outExt = assetExtensionMap[ fileExt ];

	if( ! _.isUndefined( outExt ) )
		return fileName.substring( 0, fileName.lastIndexOf( "." ) ) + outExt;
	else
		return fileName;
}

function expandDependencyWithWildcard( bundlePattern, bundles ) {
	bundlePattern = bundlePattern.replace( "*", "[^\\/]*" );
	bundlePattern += "$";
	var regExp = new RegExp( bundlePattern );
	var matchingBundles = _.filter( bundles, function( bundleName ) {
		return ! _.isNull( regExp.exec( bundleName ) );
	} );
	return matchingBundles;
}

function saveCarteroJson( contents, dir ) {
	fs.writeFileSync( path.join( dir, kCarteroJsonFile ), JSON.stringify( contents, null, "\t" ) );
}

function readCarteroJson( dir ) {
	return JSON.parse( fs.readFileSync( path.join( dir, kCarteroJsonFile ) ) );
}

exports.mapAssetFileName = mapAssetFileName;

exports.expandDependencyWithWildcard = expandDependencyWithWildcard;

exports.saveCarteroJson = saveCarteroJson;

exports.readCarteroJson = readCarteroJson;
