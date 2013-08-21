var _ = require( "underscore" ),
	path = require( "path" ),
	grunt = require( "grunt" );

var assetExtensions = [];
var tmplExtensions = [];

var fileRegistry = {};
var fileRegistryByPath = {};

var cdnFileRegex = /^https?:\/\//;

var kValidImageExts = [ ".jpg", ".png", ".gif", ".bmp", ".jpeg" ];

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

File.addToRegistry = function( file ) {
	fileRegistry[ file.src ] = file;
};

File.clearRegistry = function( file ) {
	fileRegistry = {};
};

File.getFromRegistry = function( filePath ) {
	return fileRegistry[ filePath ];
};

File.getFromRegistryByPath = function( filePath ) {
	return fileRegistryByPath [ filePath ];
};

File.rebuildRegistries = function() {
	fileRegistryByPath = {};

	_.each( fileRegistry, function( file ) {
		fileRegistryByPath[ file.path ] = file;
	} );
};

File.createAndRegister = function( options ) {
	var file = new File( options );
	File.addToRegistry( file );
	return file;
};

File.isImageFileName = function( fileName ) {
	return _.contains( kValidImageExts, File.getFileExtension( fileName ) );
};

File.isCDNFile = function( fileName ) {
	return cdnFileRegex.test( fileName );
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
	if( File.isCDNFile( fileName ) ) {
		return fileName;
	}
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
	},
	copy : function( srcDir, destDir ) {
		if( File.isCDNFile( this.src ) ) {
			this.path = this.src;
		}
		else {
			var destPath = path.join( destDir, path.relative( srcDir, this.src ) );
			grunt.file.copy( this.src,  destPath );
			this.path = destPath;
		}
	}
};

module.exports = File;