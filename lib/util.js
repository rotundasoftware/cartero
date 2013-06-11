var fs = require( "fs" ),
	path = require( "path" ),
	_ = require( "underscore" ),
	_s = require( "underscore.string" ),
	findit = require( "findit" ),
	Walker = require( "./walker" );

var kCarteroJSONFile = "cartero.json";

var bundleMetadata = {};
var pageMetadata = {};


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

exports.mapAssetFileName = function( fileName, assetExtensionMap ) {
	return mapAssetFileName( fileName, assetExtensionMap );
};

exports.expandDependencyWithWildcard = expandDependencyWithWildcard;

exports.isAssetFile = function( fileName, validOriginalAssetExt ) {
	return _.contains( validOriginalAssetExt, fileName.substring( fileName.lastIndexOf( "." ) ) );
};

exports.saveCarteroJSON = function( contents, dir ) {
	fs.writeFileSync( path.join( dir, kCarteroJSONFile ), JSON.stringify( contents, null, "\t" ) );
};

exports.readCarteroJSON = function( dir ) {
	return JSON.parse( fs.readFileSync( path.join( dir, kCarteroJSONFile ) ) );
};

exports.getFileExtension = function( fileName ) {
	return getFileExtension( fileName );

};