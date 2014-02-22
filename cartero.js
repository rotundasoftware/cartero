
var _ = require( "underscore" );
var parcelDetector = require( "parcel-detector" );
var parcelProcessor = require( "parcel-detector" );

modules.exports = function( viewDirectoryPath, outputDirecotryPath, cateroOptions, prodMode, callback ) {
	cateroOptions = _.defaults( {}, cateroOptions, {
		styleTransforms : [],
		javascriptPost : [],
		stylePost : []
	} );

	var viewMap = {};
	var parcelManifest = {};

	parcelDetector( viewDirectoryPath, function( err, parcels ) {
		if( err ) return callback( err );



		_.each( parcels, function( thisParcelData, thisParcelPackageJsonPath ) {
			parcelProcessor( thisParcelPackageJsonPath, ...,  function( err, viewPaths ) {
				if( err ) return callback( err );
				
			} );


		} );
	} );
};