var Bundle = require( "./bundle" ),
	_ = require( "underscore" );


//function Parcel( name, folder, dependencies, files, extendsParcel ) {
function Parcel( properties ) {

	//console.log( "in Parcel constructor" );

	properties.keepSeparate = true;

	Bundle.call( this, properties );

	this.extendsParcel = properties.extendsParcel;

}

function getFileType( filePath ) {
	return filePath.substring( filePath.lastIndexOf( "." ) + 1 );
}

Parcel.prototype = Object.create( Bundle.prototype );

Parcel.prototype.getFilesToServe = function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {

	console.log( "in Parcel.prototype.getFilesToServe" );
	var files = [];

	if( this.extendsParcel ) {
		console.log( "IT DOES EXTEND PARCEL! " );
		console.log( this.extendsParcel );
		files = this.extendsParcel.getFilesToServe( bundlesAlreadyInParcel, mode, false );
	}

	files = _.union( Bundle.prototype.getFilesToServe.call( this, bundlesAlreadyInParcel, mode, false ), files );

	if( ( _.isUndefined( forceKeepSeparate ) || forceKeepSeparate ) && mode === "prod" )
		files = this.mergeFiles( files );

	return files;
};

Parcel.prototype.getBundleFolder = function() {
	//var fullPath = options.appPages.destDir + this.name;
	//var folder = fullPath.replace(/\/[^\/]+$/, "" );
	return this.folder;
};

Parcel.prototype.buildResourcesToLoad = function() {

	var filesByType = {};

	_.each( this.filesToServe , function( file ) {
		var fileType = file.getFileType();
		filesByType[ fileType ] = filesByType [ fileType ] || [];
		filesByType[ fileType ].push( file.path );
	} );

	_.extend( this, filesByType )

};
/*
Parcel.prototype.getExtendsParcel = function() {
	if( this.extendsParcel ) {
		return this.parcelRegistry[ this.extendsParcel ];
	}
	else {
		return null;
	}
};
*/
module.exports = Parcel;