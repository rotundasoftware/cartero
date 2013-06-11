var _ = require( "underscore" ),
	assetBundlerUtil = require( "./util" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" ),
	CarteroFactory = require( "./carteroFactory" );
/* util files */

var options = {};

exports.doIt = function( bundleRegistry, parcelRegistry, mode ) {
/*
	_.each( bundleRegistry, function( bundle ) {
		bundle.bundleRegistry = bundleRegistry;
		bundle.parcelRegistry = parcelRegistry;
	} );

	_.each( parcelRegistry, function( parcel ) {
		parcel.bundleRegistry = bundleRegistry;
		parcel.parcelRegistry = parcelRegistry;
	} );
*/
	_.each( _.values( parcelRegistry ), function( parcel ) {

			var bundlesAlreadyInParcel = [];
			var filesToServe = parcel.getFilesToServe( bundlesAlreadyInParcel, mode );

			console.log( "files to serve for " + parcel.name );
			console.log( filesToServe );

			parcel.combinedFiles = filesToServe;


	} );

	return { bundles : bundleRegistry, parcels : parcelRegistry };
};

