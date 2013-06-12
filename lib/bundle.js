var _ = require( "underscore" ),
	_s = require( "underscore.string" ),
	assetBundlerUtil = require( "./util" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" ),
	findit = require( "findit" ),
	Walker = require( "./walker" ),
	File = require( "./file" );

var kBundleFileName = "bundle.json";

var kBundleDefaults = {
	keepSeparate : false,
	dependencies : [],
	prioritizeFlattenedSubdirectories : false,
	filePriority : [],
	filesToIgnore : [],
	browserifyExecuteOnLoad : [],
	dynamicallyLoadedFiles : [],
	devModeOnlyFiles : [],
	prodModeOnlyFiles : [],
	browserifyExecuteOnLoad : []
};

//function Bundle( name, folder, dependencies, files, keepSeparate ) {
function Bundle( properties ) {

	if( ! _.isUndefined( properties ) )
		_.extend( this, properties );

	this.filesToServe = [];
}

Bundle.prototype = {

	getFilesToServe : function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {

		var _this = this;

		var files = this.getLocalFiles();

		var keepSeparateFiles = [];
		var dependentFiles = [];

		//console.log( "in getFilesToServe for " + this.name );

		_.each( this.dependencies, function( dependency ) {

			if( _.contains( bundlesAlreadyInParcel, this ) )
				throw new Exception( "CIRCULAR DEPENDENCY! AHHH! " + this.name );

			if( _.contains( bundlesAlreadyInParcel, dependency ) ) {
				return;
			}

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
				expandedDependencies.push( bundleName );
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

		// move keepSeparate dependencies to the beginning of the list
		// TODO explain why...
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

			if( _.contains( _.pluck( _this.filesToServe, "hash" ), filePathsHash ) ) {
				//console.log( "file already exists!" );
				//need to push the combined file onto mergedFiles
				var combinedFile = _.find( _this.filesToServe, function( combinedFile ) {
					return combinedFile.hash === filePathsHash;
				} );

				mergedFiles.push( combinedFile );
			}
			else {
				//console.log( "file does not exist. need to create it!" );

				var combinedFile = new File();

				combinedFile.hash = filePathsHash;
				combinedFile.path = path.join( _this.getBundleFolder(), _this.name.substring( _this.name.lastIndexOf( "/" ) + 1 ) + "_" + filePathsHash ) + "." + fileType;
				combinedFile.keepSeparate = true;
				combinedFile.type = fileType;
				combinedFile.sourceFilePaths = _.pluck( files, "path" );
				combinedFile.filePathsHash = filePathsHash;
				_this.filesToServe.push( combinedFile );

				mergedFiles.push( combinedFile );
			}
		} );

		// for each file type list, combine the files and insert into combinedFiles
		// and append to this.combinedFiles

		return mergedFiles;
	},

	buildCombinedFiles : function() {

		var _this = this;

		_.each( _this.filesToServe, function( file ) {

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

function createRegistryForDirectory( directory, rootDir, dirOptions, mode, assetExtensionMap ) {

	var bundleRegistry = {};

	var fileDependencies = [];
	var bundleDependencies = [];

	var bundleOptions = _.extend( {}, kBundleDefaults );

	_.each( bundleOptions, function( val, key ) {
		if( _.isArray( val ) ) {
			bundleOptions[ key ] = _.union([], bundleOptions[ key ] );
		}
	} );

	var walker = new Walker( directory );

	var files = walker.ls();

	var namespacePrefix = dirOptions.namespace ? dirOptions.namespace + "/" : "";
	var bundleName = namespacePrefix + directory.substring( rootDir.length + 1 );
	var bundleDestFolder = path.join( dirOptions.destDir, directory.substring( rootDir.length + 1 ) );

	function resolveFileName( fileName ) {
		return path.join( dirOptions.destDir, walker.fullPath( assetBundlerUtil.mapAssetFileName( fileName, assetExtensionMap ) ).substring( rootDir.length + 1 ) );
	}

	if( _.contains( _.keys( files ), kBundleFileName ) ) {
		var bundleFileContents = walker.cat( kBundleFileName );
		var bundleJSON;

		try {
			bundleJSON = JSON.parse( bundleFileContents.toString() );
		}
		catch( e ) {
			throw new Error( "Failed to parse contents of bundle.json file in " + bundleName );
		}

		_.extend( bundleOptions, bundleJSON );

		if( _.isUndefined( bundleOptions.directoriesToFlatten ) )
			bundleOptions.directoriesToFlatten = dirOptions.directoriesToFlatten;

			bundleOptions.browserifyExecuteOnLoad = _.map( bundleOptions.browserifyExecuteOnLoad, function( autorunFiles ) {
				return path.join( directory, autorunFiles );
			} );
	}

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( ( _.isArray( bundleOptions.directoriesToFlatten ) && _.contains( bundleOptions.directoriesToFlatten, fileName ) ) ||
					( _.isRegExp( bundleOptions.directoriesToFlatten ) && bundleOptions.directoriesToFlatten.test( fileName ) ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), function( fileName ) {
						return File.isAssetFileName( fileName ) ;
					} );


				var subdirectoryFiles = _.map( assetFiles, function( assetFile ) {
					return assetFile.substring( directory.length + 1 );
				} );

				//if prioritizeSubdirectories is true, append the subdirectoryFiles at the beginning.
				//otherwise append them at the end
				if( bundleOptions.rioritizeFlattenedSubdirectories ) {
					fileDependencies = _.union( subdirectoryFiles, fileDependencies );
				}
				else
					fileDependencies = _.union( fileDependencies, subdirectoryFiles );

			}
			else {
				_.extend( bundleRegistry, createRegistryForDirectory( walker.fullPath( fileName ), rootDir, dirOptions, mode, assetExtensionMap ) );
			}
		}
		else if( fileStats.isFile() ) {
			if( File.isAssetFileName( fileName ) ) {
				//if prioritizeSubdirectories is true, append the file at the end.
				//otherwise append it at the beginning
				if( bundleOptions.prioritizeFlattenedSubdirectories )
					fileDependencies.push( fileName );
				else
					fileDependencies.unshift( fileName );
			}
		}
	} );

	// if childrenDependOnParents is true, add the parent directory to the dependencies (as long as we are not already at the root )
	if( dirOptions.childrenDependOnParents && directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleOptions.dependencies.push( namespacePrefix + directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) );
	}

	// if priority files are specified, push them to the beginning
	if( bundleOptions.filePriority.length > 0 ) {

		var invalidFilesInFilePriority = _.difference( bundleOptions.filePriority, fileDependencies );

		if( invalidFilesInFilePriority.length > 0 )
			throw new Error( "The following files listed in the filePriority in the bundle.json of " + bundleName + " do not exist: " + invalidFilesInFilePriority.join( ",") );

		fileDependencies = _.union( bundleOptions.filePriority, _.difference( fileDependencies, bundleOptions.filePriority ) );

	}

	//remove dynamically loaded files from the file dependencies list
	if( bundleOptions.dynamicallyLoadedFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.dynamicallyLoadedFiles );

	if( mode === "dev" && bundleOptions.prodModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.prodModeOnlyFiles );
	else if( mode === "prod" && bundleOptions.devModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.devModeOnlyFiles );

	// remove files that we want to ignore
	if( bundleOptions.filesToIgnore.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.filesToIgnore );

	fileDependencies = _.map( fileDependencies, function( fileName ) {
		return path.join( dirOptions.destDir, walker.fullPath( assetBundlerUtil.mapAssetFileName( fileName, assetExtensionMap ) ).substring( rootDir.length + 1 ) );
	} );

	bundleRegistry[ bundleName ] = new Bundle( {
		name : bundleName,
		folder : bundleDestFolder,
		files : _.map( fileDependencies, function( filePath ) {
			return new File( {
				path : filePath,
				keepSeparate : false
			} );
		} ),
		directoriesToFlatten : bundleOptions.directoriesToFlatten,
		dependencies : bundleOptions.dependencies,
		keepSeparate : bundleOptions.keepSeparate,
		browserifyExecuteOnLoad : bundleOptions.browserifyExecuteOnLoad,
		dynamicallyLoadedFiles : bundleOptions.dynamicallyLoadedFiles
	} );

	return bundleRegistry;
}

Bundle.createRegistry = function( dirs, mode, assetExtensionMap ) {
	var bundleRegistry = {};
	_.each( dirs, function( dirOptions ) {
		_.extend (bundleRegistry, createRegistryForDirectory( dirOptions.path, dirOptions.path, dirOptions, mode, assetExtensionMap ) );
	} );

	_.each( bundleRegistry, function ( bundle ) {
		bundle.dependencies = bundle.expandDependencies( bundleRegistry );
	} );

	return bundleRegistry;
};

module.exports = Bundle;