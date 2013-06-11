
var _ = require( "underscore" ),
	Bundle = require( "./bundle" ),
	File = require( "./file" ),
	Parcel = require( "./parcel" );

module.exports = {

	createBundle : function( obj ) {
		var bundle = new Bundle( obj );
		return bundle;
	},

	createParcel : function( obj ) {
		var parcel = new Parcel( obj );
		return parcel;
	},

	createFile : function( obj ) {
		var file = new File();

		if( ! _.isUndefined( obj ) ) {
			file.path = obj.path;
			file.keepSeparate = obj.keepSeparate;
			file.type = obj.type;
		}

		return file;
	}

};