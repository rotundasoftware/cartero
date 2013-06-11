var _ = require( "underscore" );

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