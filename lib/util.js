var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" );

var kCarteroJsonFile = "cartero.json";

function getFileExtension( fileName ) {
	return fileName.substring( fileName.lastIndexOf( "." ) );
}

function buildRegExpFromString( regexString ) {
	return new RegExp( regexString.substring( 1, regexString.lastIndexOf( "/" ) ), regexString.substring( regexString.lastIndexOf( "/" ) + 1 ) );
}

function mapAssetFileName( fileName, assetExtensionMap ) {

	var fileExt = fileName.substring( fileName.lastIndexOf( "." ) );

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

function isAssetFile( fileName, validOriginalAssetExt ) {
	return _.contains( validOriginalAssetExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
}

function saveCarteroJson( contents, dir ) {
	fs.writeFileSync( path.join( dir, kCarteroJsonFile ), JSON.stringify( contents, null, "\t" ) );
}

function readCarteroJson( dir ) {
	return JSON.parse( fs.readFileSync( path.join( dir, kCarteroJsonFile ) ) );
}

exports.mapAssetFileName = mapAssetFileName;

exports.expandDependencyWithWildcard = expandDependencyWithWildcard;

exports.isAssetFile = isAssetFile;

exports.saveCarteroJson = saveCarteroJson;

exports.readCarteroJson = readCarteroJson;

exports.getFileExtension = getFileExtension;