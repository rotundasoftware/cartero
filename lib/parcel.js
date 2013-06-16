var Bundle = require( "./bundle" ),
	File = require( "./file" ),
	_ = require( "underscore" ),
	Walker =require( "./walker" ),
	findit = require( "findit" ),
	fs = require( "fs" ),
	path = require( "path" );

var kCarteroRequiresDirective = "##cartero_requires";
var kCarteroExtendsDirective = "##cartero_extends";

var carteroRequiresRegExp = new RegExp( kCarteroRequiresDirective + " (.*?)(-->)?\n" );
var carteroExtendsRegExp = new RegExp( kCarteroExtendsDirective + " \"(.*?)\"\\s*?(-->)?\n" );

function Parcel( properties ) {
	properties.keepSeparate = true;
	Bundle.call( this, properties );
	this.extendsParcel = properties.extendsParcel;
}

Parcel.prototype = Object.create( Bundle.prototype );

Parcel.prototype.getFilesToServe = function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {

	if( ! _.isUndefined( this.filesToServe ) )
		return this.filesToServe;

	var files = [];

	if( this.extendsParcel ) {
		files = this.extendsParcel.getFilesToServe( bundlesAlreadyInParcel, mode, false );
	}

	files = _.union( Bundle.prototype.getFilesToServe.call( this, bundlesAlreadyInParcel, mode, false ), files );

	if( ( _.isUndefined( forceKeepSeparate ) || forceKeepSeparate ) && mode === "prod" )
		files = this.mergeFiles( files );

	return files;
};

Parcel.prototype.getBundleDirectory = function() {
	return this.directory;
};

Parcel.prototype.separateFilesToServeByType = function() {
	var filesByType = File.getFilesByType( this.filesToServe );
	_.extend( this, filesByType );
};

function createRegistryForDirectory( directory, rootDir, dirOptions, assetExtensionMap ) {
	var parcelRegistry = {};
	var walker = new Walker( directory );
	var files = walker.ls();
	var fileDependencies = [];
	var namespacePrefix = dirOptions.namespace ? dirOptions.namespace + "/" : "";

	var pageFiles = _.filter( _.keys( files ), function( fileName ) {
		return _.contains( dirOptions.viewFileExt, File.getFileExtension( fileName ) );
	} );

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( dirOptions.directoriesToIgnore.test( fileName ) ) return;

			if( dirOptions.directoriesToFlatten.test( fileName ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), function( fileName ) {

					return File.isAssetFileName( fileName );
					} );
				fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
					return File.mapAssetFileName( path.join( dirOptions.destDir, assetFile.substring( rootDir.length ) ), assetExtensionMap );
				} ) );
			}
			else {
				_.extend( parcelRegistry, createRegistryForDirectory( walker.fullPath( fileName ), rootDir, dirOptions, assetExtensionMap ) );
			}
		}
		else if( fileStats.isFile() ) {
			if( dirOptions.filesToIgnore.test( fileName ) ) return;

			if( File.isAssetFileName( fileName ) ) fileDependencies.push( path.join( dirOptions.destDir, walker.fullPath( File.mapAssetFileName( fileName, assetExtensionMap ) ).substring( rootDir.length + 1) ) );
		}
	} );

	_.each( pageFiles, function( fileName ) {
		var pageFileContents = fs.readFileSync( walker.fullPath( fileName ) ).toString();
		var parcelPath = path.join( dirOptions.path, walker.fullPath( fileName ).substring( rootDir.length + 1 ) );
		var parcelName = namespacePrefix + walker.fullPath( fileName ).substring( rootDir.length + 1 );
		var parcelDirectory = path.join( dirOptions.destDir, walker.fullPath( fileName ).substring( rootDir.length + 1 ) ).replace( /\/[^\/]+$/, "" );

		var dependencies = [];
		var extendsParcel = null;

		var carteroRequiresMatches = carteroRequiresRegExp.exec( pageFileContents );

		if( !_.isNull( carteroRequiresMatches ) ) {
			try {
				dependencies = JSON.parse( "[" + carteroRequiresMatches[1] + "]" );
			}
			catch( e ) {
				throw new Error ( "Error while parsing required bundles for parcel \"" + parcelName + "\": " + e );
			}
		}

		var carteroExtendsMatches = carteroExtendsRegExp.exec( pageFileContents );

		if( !_.isNull( carteroExtendsMatches ) ) {
			extendsParcel = carteroExtendsMatches[1];
		}

		parcelRegistry[ parcelName ] = new Parcel( {
			name : parcelName,
			path : parcelPath,
			directory : parcelDirectory,
			files : _.map( fileDependencies, function( filePath ) {
				return new File( {
					path : filePath,
					keepSeparate : false
				} );
			} ),
			dependencies : dependencies,
			extendsParcel : extendsParcel
		} );
	} );

	return parcelRegistry;
}


Parcel.createRegistry = function( dirs, bundleRegistry, mode, assetExtensionMap ) {
	var parcelRegistry = {};

	_.each( dirs, function ( dirOptions ) {
		_.extend( parcelRegistry, createRegistryForDirectory( dirOptions.path, dirOptions.path, dirOptions, assetExtensionMap ) );
	} );

	_.each( parcelRegistry, function( parcel ) {
		if( ! _.isNull( parcel.extendsParcel ) ) {
			parcel.extendsParcel = parcelRegistry[ parcel.extendsParcel ];
		}
	} );

	_.each( parcelRegistry, function ( parcel ) {
		parcel.dependencies = parcel.expandDependencies( bundleRegistry );
	} );

	_.each( parcelRegistry, function( parcel ) {
		parcel.clearFilesToServeForKeepSeparateBundles();

		var bundlesAlreadyInParcel = [];
		parcel.populateFilesToServeForKeepSeparateBundles( mode, bundlesAlreadyInParcel );
	} );

	return parcelRegistry;
};

module.exports = Parcel;