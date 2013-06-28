var Bundle = require( "./bundle" ),
	File = require( "./file" ),
	_ = require( "underscore" ),
	Walker =require( "./walker" ),
	findit = require( "findit" ),
	fs = require( "fs" ),
	path = require( "path" );

var kCarteroRequiresDirective = "##cartero_requires";
var kCarteroExtendsDirective = "##cartero_extends";

var carteroRequiresRegExp = /##cartero_requires((\s*['"].*?['"]\s*,?\s*\n?)+)/;
var carteroExtendsRegExp = new RegExp( kCarteroExtendsDirective + " [\"'](.*?)[\"'].*?\n" );

function Parcel( properties ) {
	properties.keepSeparate = true;
	Bundle.call( this, properties );
	this.extendsParcel = properties.extendsParcel;
}

/** Static functions **/

Parcel.createRegistry = function( dirs, bundleRegistry, mode ) {
	var parcelRegistry = {};

	_.each( dirs, function ( dirOptions ) {
		_.extend( parcelRegistry, createRegistryForDirectory( dirOptions.path, dirOptions.path, dirOptions ) );
	} );

	_.each( parcelRegistry, function( parcel ) {
		if( ! _.isNull( parcel.extendsParcel ) ) {
			parcel.extendsParcel = parcelRegistry[ parcel.extendsParcel ];
		}
	} );

	_.each( parcelRegistry, function ( parcel ) {
		parcel.dependencies = parcel.expandDependencies( bundleRegistry );
	} );



	return parcelRegistry;
};

Parcel.populateFilesToServe = function( parcelRegistry, mode ) {
	_.each( parcelRegistry, function( parcel ) {
		parcel.clearFilesToServeForKeepSeparateBundles();

		var bundlesAlreadyInParcel = [];
		parcel.populateFilesToServeForKeepSeparateBundles( mode, bundlesAlreadyInParcel );
	} );
};

/** Public functions **/

Parcel.prototype = Object.create( Bundle.prototype );

Parcel.prototype.getFilesToServe = function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {
	if( ! _.isUndefined( this.filesToServe ) )
		return this.filesToServe;

	var files = [];

	if( this.extendsParcel ) {
		files = this.extendsParcel.getFilesToServe( bundlesAlreadyInParcel, mode, false );
	}

	files = _.union( files, Bundle.prototype.getFilesToServe.call( this, bundlesAlreadyInParcel, mode, false ) );

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

/** Private functions **/

function createRegistryForDirectory( directory, rootDir, dirOptions ) {
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

				var subdirectoryFiles = _.map( assetFiles, function( fileName ) {
					return fileName.substring( directory.length + 1 );
				} );
				//fileDependencies = _.union( fileDependencies, _.map( assetFiles, function( assetFile ) {
				//	return File.mapAssetFileName( path.join( dirOptions.destDir, assetFile.substring( rootDir.length ) ), assetExtensionMap );
				//} ) );
				fileDependencies = _.union( fileDependencies, subdirectoryFiles );
			}
			else {
				_.extend( parcelRegistry, createRegistryForDirectory( walker.fullPath( fileName ), rootDir, dirOptions ) );
			}
		}
		else if( fileStats.isFile() ) {
			if( dirOptions.filesToIgnore.test( fileName ) ) return;

			//if( File.isAssetFileName( fileName ) ) fileDependencies.push( path.join( dirOptions.destDir, walker.fullPath( File.mapAssetFileName( fileName, assetExtensionMap ) ).substring( rootDir.length + 1) ) );
			if( File.isAssetFileName( fileName ) ) fileDependencies.push( fileName );
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
				var directiveParamsString = carteroRequiresMatches[1];
				dependencies = JSON.parse( "[" + directiveParamsString + "]" );
			}
			catch( e ) {
				throw new Error ( "Argument " + directiveParamsString + " for ##cartero_requires directive is not valid in \"" + parcelName + "\": " + e );
			}
		}

		var carteroExtendsMatches = carteroExtendsRegExp.exec( pageFileContents );

		if( !_.isNull( carteroExtendsMatches ) ) {
			extendsParcel = carteroExtendsMatches[1];
		}

		var fileDependenciesForParcel = _.without( fileDependencies, fileName );

		fileDependenciesForParcel = _.map( fileDependenciesForParcel, function( filePath ) {
			return File.createAndRegister( { src : walker.fullPath( filePath ), keepSeparate : false } );
		} );

		parcelRegistry[ parcelName ] = new Parcel( {
			name : parcelName,
			path : parcelPath,
			dirOptions : dirOptions,
			directory : parcelDirectory,
			files : fileDependenciesForParcel,
/*
			files : _.map( fileDependencies, function( filePath ) {
				return new File( {
					path : filePath,
					keepSeparate : false
				} );
			} ),
*/
			dependencies : dependencies,
			extendsParcel : extendsParcel
		} );
	} );

	return parcelRegistry;
}

module.exports = Parcel;
