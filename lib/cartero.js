var _ = require( "underscore" ),
	assetBundlerUtil = require( "./util" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" );
/* util files */

function getFileType( filePath ) {

	return filePath.substring( filePath.lastIndexOf( "." ) + 1 );

}

var bundles = {};
var parcels = {};

var options = {};

function Bundle( name, folder, dependencies, files, keepSeparate ) {

	//console.log( "in Bundle constructor" );

	this.name = name;
	this.folder = folder;
	this.dependencies = dependencies;
	this.files = files;
	this.keepSeparate = keepSeparate;

	this.combinedFiles = [];
}

Bundle.prototype = {

	getFilesToServe : function( bundlesAlreadyInParcel, forceKeepSeparate ) {

		//console.log( "in Bundle.prototype.getFilesToServe" );

		//console.log( "getFilesToServe for " + this.name );

		//if( this.name === "App/Client/FieldDefinition" )
		//	throw new Error( "found it!" );

		var _this = this;

		var files = this.getLocalFiles();

		var keepSeparateFiles = [];
		var dependentFiles = [];

		var dependencies = this.getDependencies();

		console.log( this.dependencies );
		console.log( _.pluck( dependencies, "name" ) );

		_.each( dependencies, function( dependency ) {

			if( _.contains( bundlesAlreadyInParcel, this ) )
				throw new Exception( "CIRCULAR DEPENDENCY! AHHH! " + this.name );

			if( _.contains( bundlesAlreadyInParcel, dependency ) ) {
				console.log( "dependency " + dependency.name + " already in parcel. ignoring." );
				return;
			}

			//console.log( "label 2 " + dependency.name );

			if( dependency.keepSeparate )
				keepSeparateFiles = _.union( dependency.getFilesToServe( bundlesAlreadyInParcel ), keepSeparateFiles );
			else
				dependentFiles = _.union( dependentFiles, dependency.getFilesToServe( bundlesAlreadyInParcel )  );

		} );

		files = _.union( keepSeparateFiles, dependentFiles, files );

		//console.log( files );

		bundlesAlreadyInParcel.push( this );

		var keepSeparate = _.isUndefined( forceKeepSeparate ) ? this.keepSeparate : forceKeepSeparate;

		if( keepSeparate && options.mode === "prod" )
			files = this.mergeFiles( files );

		return files;

	},

	getDependencies : function( bundleMap ) {

		var expandedDependencies = [];

		_.each( this.dependencies, function( bundleName ) {
			if( bundleName.indexOf( "*" ) !== -1 ) {
				expandedDependencies = _.union( expandedDependencies, assetBundlerUtil.expandDependencyWithWildcard( bundleName, _.keys( bundles ) ) );

				//console.log( "expanded dependencies: " + expandedDependencies );

			}
			else {
				expandedDependencies.unshift( bundleName );
			}
		} );

		expandedDependencies = _.map( expandedDependencies, function( bundleName ) {
			if( _.isUndefined( bundles[ bundleName ] ) ) {
				console.log( "Could not find bundle in bundle map: " + bundleName );
			}
			return bundles[ bundleName ];
		} );

		var keepSeparateDependencies = _.filter( expandedDependencies, function( dependency ) {
			return dependency.keepSeparate;
		} );

		expandedDependencies = _.union( keepSeparateDependencies, expandedDependencies );

		return expandedDependencies;
	},

	getLocalFiles : function() {
		return this.files;
	},

	getBundleFolder : function() {
		//return options.assetLibrary.destDir + this.name;
		return this.folder;
	},

	mergeFiles : function( files ) {

		var _this = this;

		var mergedFiles = [];

		var filesToConcat = [];


		_.each( files, function( file ) {

			if( file.keepSeparate ) {
				mergedFiles.push( file );
			}
			else {
				//build list of files for each file type
				filesToConcat.push( file );
			}
		} );

		var filesByType = getFilesByType( _.pluck( filesToConcat, "path" ) );

		_.each( filesByType, function( filePaths, fileType) {

			//console.log( filePaths );
			var filePathsHash = createHash( filePaths );

			if( _.contains( _.pluck( _this.combinedFiles, "hash" ), filePathsHash ) ) {
				//console.log( "file already exists!" );
				//need to push the combined file onto mergedFiles
				var combinedFile = _.find( _this.combinedFiles, function( combinedFile ) {
					return combinedFile.hash === filePathsHash;
				} );

				mergedFiles.push( combinedFile );
			}
			else {
				//console.log( "file does not exist. need to create it!" );

				var combinedFile = BundlerFactory.createFile();

				combinedFile.hash = filePathsHash;
				combinedFile.path = path.join( _this.getBundleFolder(), _this.name.substring( _this.name.lastIndexOf( "/" ) + 1 ) + "_" + filePathsHash ) + "." + fileType;
				combinedFile.keepSeparate = true;
				combinedFile.type = fileType;
				combinedFile.sourceFilePaths = filePaths;
				combinedFile.filePathsHash = filePathsHash;
				_this.combinedFiles.push( combinedFile );

				mergedFiles.push( combinedFile );
			}
		} );

		// for each file type list, combine the files and insert into combinedFiles
		// and append to this.combinedFiles

		return mergedFiles;
	},

	buildCombinedFiles : function() {

		var _this = this;

		_.each( _this.combinedFiles, function( file ) {

			var combinedFileContents = _.map( file.sourceFilePaths, function( filePath ) {
				return fs.readFileSync( filePath ).toString() ;
			} ).join( "\n" );

			var hash = crypto.createHash( "sha1" ).update( combinedFileContents ).digest( "hex" );

			file.path = file.path.replace( file.filePathsHash, hash );

			fs.writeFileSync( file.path, combinedFileContents );

		} );
	}

};

function getFilesByType( filePaths ) {

	var fileTypes = {};
	_.each( filePaths, function( filePath ) {
		var fileType = getFileType( filePath );
		fileTypes[ fileType ] = fileTypes[ fileType ] || [];
		fileTypes[ fileType ].push( filePath );
	} );

	return fileTypes;
}

function createHash( filePaths ) {
	return crypto.createHash( "sha1" ).update( filePaths.join( "," ) ).digest( "hex" );
}

function Parcel( name, folder, dependencies, files, extendsParcel ) {

	//console.log( "in Parcel constructor" );

	Bundle.apply( this, [ name, folder, dependencies, files, true ] );

	this.extendsParcel = extendsParcel;

}

Parcel.prototype = Object.create( Bundle.prototype );

Parcel.prototype.getFilesToServe = function( bundlesAlreadyInParcel, forceKeepSeparate ) {

	console.log( "in Parcel.prototype.getFilesToServe" );
	var files = [];

	if( this.getExtendsParcel() ) {
		console.log( "IT DOES EXTEND PARCEL! " );
		files = this.getExtendsParcel().getFilesToServe( bundlesAlreadyInParcel, false );
	}

	files = _.union( Bundle.prototype.getFilesToServe.call( this, bundlesAlreadyInParcel, false ), files );

	if( ( _.isUndefined( forceKeepSeparate ) || forceKeepSeparate ) && options.mode === "prod" )
		files = this.mergeFiles( files );

	return files;
};

Parcel.prototype.getBundleFolder = function() {
	//var fullPath = options.appPages.destDir + this.name;
	//var folder = fullPath.replace(/\/[^\/]+$/, "" );
	return this.folder;
};

Parcel.prototype.buildResourcesToLoad = function() {
	var _this = this;

	if( options.mode === "prod" ) {

		var devFilePaths = [];
		_this[ "dev" ] = _this[ "dev" ] || {};

		_.each( this.combinedFiles, function( file ) {
			devFilePaths = _.union( devFilePaths, file.sourceFilePaths );
		} );

		_.each( filePaths, function( filePath ) {
			var fileType = getFileType( filePath );
			_this[ "dev" ][ fileType ] = _this[ "dev" ][ fileType ] || [];
			_this[ "dev" ][ fileType ].push( filePath );
		} );

	}

	_this[ options.mode ] = _this[ options.mode ] || {};

	var filePaths = _.pluck( this.combinedFiles, "path" );

	_.each( filePaths, function( filePath ) {
		var fileType = getFileType( filePath );
		_this[ options.mode ][ fileType ] = _this[ options.mode ][ fileType ] || [];
		_this[ options.mode ][ fileType ].push( filePath );
	} );

};

Parcel.prototype.getExtendsParcel = function() {
	if( this.extendsParcel ) {
		return parcels[ this.extendsParcel ];
	}
	else {
		return null;
	}
};

function File() {

}

File.prototype = {

	toString : function() {
		return this.path + "|" + this.type + "|" + this.keepSeparate + "|" + _.pluck( this.combinedFiles, "path" );
	}

};

exports.Parcel = Parcel;
exports.Bundle = Bundle;

BundlerFactory = {

	createBundle : function( obj ) {
		var bundle = new Bundle( obj.name, obj.folder, obj.dependencies, obj.files, obj.keepSeparate );
		return bundle;
	},

	createParcel : function( obj ) {
		var parcel = new Parcel( obj.name, obj.folder, obj.dependencies, obj.files, obj.extendsParcel );
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

exports.doIt = function( bundleMap, parcelMap, opts ) {

	options = opts;

	//populate `bundles` and `parcels` with data
	_.each( _.values( bundleMap ), function( bundleData ) {

		// convert array of file paths to an array of File objects
		bundleData.files = _.map( bundleData.files, function( filePath ) {
			return BundlerFactory.createFile( {
				//path : path.join( options.assetLibrary.destDir, filePath ),
				path : filePath,
				keepSeparate : false,
				type : getFileType( filePath )
			} );
		} );
		bundles[ bundleData.name ] = BundlerFactory.createBundle( bundleData );
	} );

	_.each( _.keys( parcelMap ), function( parcelName ) {
		var parcelData = parcelMap[ parcelName ];

		//do some mapping between currently generated properties and what we actually want to use...
		parcelData.extendsParcel = parcelData.extendsPage;
		delete( parcelData.extendsPage );
		parcelData.dependencies = parcelData.requiredBundles;
		parcelData.name = parcelName;
		delete( parcelData.requiredBundles );

		parcelData.files = _.map( parcelData.files, function( filePath ) {
			return BundlerFactory.createFile( {
				//path : path.join( options.appPages.destDir, filePath ),
				path : filePath,
				keepSeparate : false,
				type : getFileType( filePath )
			} );
		} );

		//console.log( "adding parcel to map: " + parcelName );

		parcels[ parcelName ] = BundlerFactory.createParcel( parcelData );
	} );

	//console.log( "number of parcels: " + _.values( parcels ).length );

	_.each( _.values( parcels ), function( parcel ) {

		//try {
			//console.log( "processing parcel " + parcel.name );
			//console.log( "label 3 " + parcelName );
			var bundlesAlreadyInParcel = [];
			var filesToServe = parcel.getFilesToServe( bundlesAlreadyInParcel );

			parcel.combinedFiles = filesToServe;

			//console.log( "COMBINED FILES FOR " + parcel.name + " " + filesToServe );
		//}
		//catch( e ) {
		//	console.log( "Error while processing parcel: " + parcel.name + ": " + e.stack );
		//}

	} );

	return { bundles : bundles, parcels : parcels };
};

