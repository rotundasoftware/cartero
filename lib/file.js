var _ = require( "underscore" );

var assetExtensions = [];
var tmplExtensions = [];

function File( obj ) {
	if( ! _.isUndefined( obj ) )
		_.extend( this, obj );
}

/** Static functions **/

File.getFileExtension = function( fileName ) {
	return fileName.substring( fileName.lastIndexOf( "." ) );
};

File.setAssetExtensions = function( extensions ) {
	assetExtensions = extensions;
};

File.setTmplExtensions = function( extensions ) {
	tmplExtensions = extensions;
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
};

File.mapAssetFileName = function( fileName, assetExtensionMap ) {
	var fileExt = File.getFileExtension( fileName );
	var outExt = assetExtensionMap[ fileExt ];

	if( ! _.isUndefined( outExt ) )
		return fileName.substring( 0, fileName.lastIndexOf( "." ) ) + outExt;
	else
		return fileName;
};

/** Public functions **/

File.prototype = {
	getFileType : function() {
		var extension = this.getFileExtension();

		if( _.contains( tmplExtensions, extension ) )
			return "tmpl";
		else
			return extension.substring( 1 );
	},
	getFileExtension : function() {
		return File.getFileExtension( this.path );
	}
};

module.exports = File;