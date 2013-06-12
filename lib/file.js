var _ = require( "underscore" );

var assetExtensions = [];

function File( obj ) {

	if( ! _.isUndefined( obj ) )
		_.extend( this, obj );

}

File.prototype = {

	toString : function() {
		return this.path + "|" + this.type + "|" + this.keepSeparate + "|" + _.pluck( this.combinedFiles, "path" );
	},

	getFileType : function() {
		return this.path.substring( this.path.lastIndexOf( "." ) + 1 );
	}

};

File.getFileExtension = function( fileName ) {
	return fileName.substring( fileName.lastIndexOf( "." ) );
};

File.setAssetExtensions = function( extensions ) {
	assetExtensions = extensions;
};

File.isAssetFileName = function( fileName ) {
	return _.contains( assetExtensions, this.getFileExtension( fileName ) );
};

File.getFilesByType = function( files ) {
	var filesByType = {};

	_.each( files , function( file ) {
		var fileType = file.getFileType();
		filesByType[ fileType ] = filesByType [ fileType ] || [];
		filesByType[ fileType ].push( file.path );
	} );

	return filesByType;
}

module.exports = File;