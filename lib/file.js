var _ = require( "underscore" ),
	_s = require("underscore.string"),
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

File.isValidObjectDefinition = function(fileName){
	if (_.isObject(fileName)){
		if (_.has(fileName, "fileName") && _.has(fileName, "extension") && _.isString(fileName["fileName"]) && _.isString(fileName["extension"]) ){
			return true;
		} else {
			throw new Error("Definition of dependency must be a string or and object with fileName and extension properties");
		}
	} else {
		return false;
	}
};

File.getFileName = function( fileName ) {
	if (File.isValidObjectDefinition(fileName)){
		return fileName["fileName"];
	} else {
		return fileName;
	}
};

File.getFileExtension = function( fileName ) {
	if (File.isValidObjectDefinition(fileName)){
		var ext = fileName["extension"];
		if(!_s.startsWith(ext, '.')){
			ext = "."+ext;
		}
		return ext;
	}
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
	return cdnFileRegex.test(File.getFileName(fileName));
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
	// don't map CDN file names
	if( File.isCDNFile( fileName ) ) {
		return File.getFileName(fileName);
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
		if(File.isCDNFile(this.src)){
			return File.getFileExtension( this.src );
		} else {
			return File.getFileExtension( this.path );
		}
	},
	copy : function( srcDir, destDir ) {
		// for CDN files, copy the src to the path, but don't do the actual file copy
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
