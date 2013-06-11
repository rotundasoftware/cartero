var _ = require( "underscore" ),
	assetBundlerUtil = require( "./util" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" );
	//CarteroFactory = require( "./carteroFactory" );

//function Bundle( name, folder, dependencies, files, keepSeparate ) {
function Bundle( properties ) {

	//console.log( "in Bundle constructor" );

	//this.name = name;
	//this.folder = folder;
	//this.dependencies = dependencies;
	//this.files = files;
	//this.keepSeparate = keepSeparate;

	console.log( "creating a bundle: " + properties.name );
	_.extend( this, properties );

	console.log( "stored bundle name: " + this.name );

	this.combinedFiles = [];
}

Bundle.prototype = {

	getFilesToServe : function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {

		//console.log( "in Bundle.prototype.getFilesToServe" );

		//console.log( "getFilesToServe for " + this.name );

		//if( this.name === "App/Client/FieldDefinition" )
		//	throw new Error( "found it!" );

		var _this = this;

		var files = this.getLocalFiles();

		var keepSeparateFiles = [];
		var dependentFiles = [];

		//var dependencies = this.getDependencies();

		//console.log( this.dependencies );
		//console.log( _.pluck( dependencies, "name" ) );

		_.each( this.dependencies, function( dependency ) {

			if( _.contains( bundlesAlreadyInParcel, this ) )
				throw new Exception( "CIRCULAR DEPENDENCY! AHHH! " + this.name );

			if( _.contains( bundlesAlreadyInParcel, dependency ) ) {
				console.log( "dependency " + dependency.name + " already in parcel. ignoring." );
				return;
			}

			//console.log( "label 2 " + dependency.name );

			console.log( "dependency:" );
			console.log( dependency );
			if( dependency.keepSeparate )
				keepSeparateFiles = _.union( dependency.getFilesToServe( bundlesAlreadyInParcel, mode ), keepSeparateFiles );
			else
				dependentFiles = _.union( dependentFiles, dependency.getFilesToServe( bundlesAlreadyInParcel, mode )  );

		} );

		files = _.union( keepSeparateFiles, dependentFiles, files );

		//console.log( files );

		bundlesAlreadyInParcel.push( this );

		var keepSeparate = _.isUndefined( forceKeepSeparate ) ? this.keepSeparate : forceKeepSeparate;

		if( keepSeparate && mode === "prod" )
			files = this.mergeFiles( files );

		return files;

	},

	expandDependencies : function( bundleRegistry ) {

		var _this = this;

		var expandedDependencies = [];

		_.each( this.dependencies, function( bundleName ) {
			if( bundleName.indexOf( "*" ) !== -1 ) {
				expandedDependencies = _.union( expandedDependencies, assetBundlerUtil.expandDependencyWithWildcard( bundleName, _.pluck( bundleRegistry, "name" ) ) );

			}
			else {
				expandedDependencies.unshift( bundleName );
			}
		} );

		expandedDependencies = _.map( expandedDependencies, function( bundleName ) {
			if( _.isUndefined( bundleRegistry[ bundleName ] ) ) {
				console.log( "Could not find bundle in bundle map: " + bundleName );
			}
			return bundleRegistry[ bundleName ];
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

		var filesByType = getFilesByType( filesToConcat );

		_.each( filesByType, function( files, fileType ) {

			//console.log( filePaths );
			var filePathsHash = createHash( _.pluck( files, "path" ) );

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

				var combinedFile = require( "./carteroFactory" ).createFile();

				combinedFile.hash = filePathsHash;
				combinedFile.path = path.join( _this.getBundleFolder(), _this.name.substring( _this.name.lastIndexOf( "/" ) + 1 ) + "_" + filePathsHash ) + "." + fileType;
				combinedFile.keepSeparate = true;
				combinedFile.type = fileType;
				combinedFile.sourceFilePaths = _.pluck( files, "path" );
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

function getFilesByType( files ) {

	var fileTypes = {};
	_.each( files, function( file ) {
		var fileType = file.getFileType();
		fileTypes[ fileType ] = fileTypes[ fileType ] || [];
		fileTypes[ fileType ].push( file );
	} );

	return fileTypes;
}

function createHash( filePaths ) {
	return crypto.createHash( "sha1" ).update( filePaths.join( "," ) ).digest( "hex" );
}

module.exports = Bundle;