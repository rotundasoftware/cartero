var _ = require( "underscore" ),
	_s = require( "underscore.string" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" ),
	findit = require( "findit" ),
	Walker = require( "./walker" ),
	File = require( "./file" ),
	grunt = require( "grunt" );

var kBundleFileName = "bundle.json";
var kBowerFileName = "bower.json";
var kPackageJsonFileName = "package.json";

var kBundleDefaults = {
	keepSeparate : false,
	dependencies : [],
	directoriesToIgnore : [],
	prioritizeFlattenedDirectories : false,
	filePriority : [],
	filesToIgnore : [],
	browserify_executeOnLoad : [],
	dynamicallyLoadedFiles : [],
	devModeOnlyFiles : [],
	prodModeOnlyFiles : []
};

function Bundle( properties ) {
	if( ! _.isUndefined( properties ) )
		_.extend( this, properties );
}

/** Static functions **/

Bundle.createRegistry = function( dirs, mode ) {
	var bundleRegistry = {};
	_.each( dirs, function( dirOptions ) {
		var walker = new Walker( dirOptions.path );
		var files = walker.ls();

		_.each( files, function ( file, fileName ) {
			if( file.isDirectory() )
				_.extend (bundleRegistry, createRegistryForDirectory( walker.fullPath( fileName ), dirOptions.path, dirOptions, mode ) );
		} );
	} );

	_.each( bundleRegistry, function ( bundle ) {
		bundle.dependencies = bundle.expandDependencies( bundleRegistry );
	} );

	return bundleRegistry;
};

Bundle.expandDependencyWithWildcard = function( bundlePattern, bundles ) {
	bundlePattern = bundlePattern.replace( "*", "[^\\/]*" );
	bundlePattern += "$";
	var regExp = new RegExp( bundlePattern );
	var matchingBundles = _.filter( bundles, function( bundleName ) {
		return ! _.isNull( regExp.exec( bundleName ) );
	} );
	return matchingBundles;
};

/** Public functions **/

Bundle.prototype = {

	getFilesToServe : function( bundlesAlreadyIncluded, mode, forceKeepSeparate ) {
		if( ! _.isUndefined( this.filesToServe ) ) {
			return this.filesToServe;
		}

		var _this = this;
		var files = _.filter( this.getLocalFiles(), function( file ) {
			return ! file.isDynamicallyLoaded;
		} );

		var dependentFiles = [];

		var dependencies = _.sortBy( this.dependencies, function( dependency ) {
			return dependency.keepSeparate ? 0 : 1;
		} );

		_.each( dependencies, function( dependency ) {
			if( _.contains( bundlesAlreadyIncluded, dependency ) )
				return;

			dependentFiles = _.union( dependentFiles, dependency.getFilesToServe( bundlesAlreadyIncluded, mode )  );

			// Add this child dependency to bundlesAlreadyIncluded at this point because this child will be added to somebody's filesToServe
			// Doing this outside of this loop and on `this` dependency doesn't work because when getFilesToServe is called for a keepSeparate bundle,
			// the files are only saved in this.filesToServe, and not in any parcel/bundle.
			bundlesAlreadyIncluded.push( dependency );
		} );

		files = _.union( dependentFiles, files );

		var keepSeparate = _.isUndefined( forceKeepSeparate ) ? this.keepSeparate : forceKeepSeparate;

		if( keepSeparate && mode === "prod" )
			files = this.mergeFiles( files );

		return files;
	},

	populateFilesToServeForKeepSeparateBundles : function( mode, bundlesAlreadyIncluded ) {
		_.each( this.dependencies, function( dependency ) {
			dependency.populateFilesToServeForKeepSeparateBundles( mode, bundlesAlreadyIncluded );
		} );

		if( this.keepSeparate ) {
			this.filesToServe = this.getFilesToServe( bundlesAlreadyIncluded, mode );
		}
	},

	clearFilesToServeForKeepSeparateBundles : function() {
		if( this.keepSeparate )
			this.filesToServe = undefined;

		_.each( this.dependencies, function( dependency ) {
			dependency.clearFilesToServeForKeepSeparateBundles();
		} );
	},

	expandDependencies : function( bundleRegistry ) {
		var _this = this;
		var expandedDependencies = [];

		_.each( this.dependencies, function( bundleName ) {
			if( bundleName.indexOf( "*" ) !== -1 ) {
				expandedDependencies = _.union( expandedDependencies, Bundle.expandDependencyWithWildcard( bundleName, _.pluck( bundleRegistry, "name" ) ) );
			}
			else {
				expandedDependencies.push( bundleName );
			}
		} );

		expandedDependencies = _.map( expandedDependencies, function( bundleName ) {
			if( _.isUndefined( bundleRegistry[ bundleName ] ) ) {
				console.log( "Could not find bundle in bundle map: " + bundleName + " for bundle " + this.name );
			}
			return bundleRegistry[ bundleName ];
		} );

		return expandedDependencies;
	},

	getLocalFiles : function() {
		return this.files;
	},

	getBundleDirectory : function() {
		return this.directory;
	},

	copy : function() {
		var _this = this;
		_.each( _this.files, function( file ) {
			file.copy( _this.dirOptions.path, _this.dirOptions.destDir );
		} );
	},

	mergeFiles : function( files ) {
		var _this = this;
		var mergedFiles = [];
		var filesToConcat = [];

		_.each( files, function( file ) {
			if( file.keepSeparate )
				mergedFiles.push( file );
			else
				filesToConcat.push( file );
		} );

		var filesByType = File.getFilesByType( filesToConcat );

		_.each( filesByType, function( filePaths, fileType ) {
			var combinedFile = new File();

			combinedFile.keepSeparate = true;
			combinedFile.type = fileType;

			var combinedFileContents = _.map( filePaths, function( filePath ) {
				return fs.readFileSync( filePath ).toString() ;
			} ).join( "\n" );

			var hash = crypto.createHash( "md5" ).update( combinedFileContents ).digest( "hex" );

			combinedFile.path = path.join( _this.getBundleDirectory(), _this.name.substring( _this.name.lastIndexOf( "/" ) + 1 ) + "_" + hash ) + "." + fileType;

			combinedFile.sourceFilePaths = filePaths;

			// The file may already exist from a previously processed parcel.
			if( ! fs.existsSync( combinedFile.path ) )
				grunt.file.write( combinedFile.path, combinedFileContents );

			mergedFiles.push( combinedFile );
		} );

		return mergedFiles;
	}
};

/** Private functions **/

function createRegistryForDirectory( directory, rootDir, dirOptions, mode ) {
	var bundleRegistry = {};
	var fileDependencies = [];
	var bundleDependencies = [];

	var dynamicallyLoadedFiles = [];

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
	var bundleDestDir = path.join( dirOptions.destDir, directory.substring( rootDir.length + 1 ) );

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
	}
	else if( ! _.isUndefined( dirOptions.bundleProperties ) &&  ! _.isUndefined( dirOptions.bundleProperties[ bundleName ] ) )
		_.extend( bundleOptions, dirOptions.bundleProperties[ bundleName ] );

	if( _.contains( _.keys( files ), kPackageJsonFileName ) ) {
		bundleOptions.packageJson = JSON.parse( walker.cat( kPackageJsonFileName ) );
	}

	// Get dependencies from the bower.json file if it exists.
	if( _.contains( _.keys( files ), kBowerFileName ) ) {
		var bowerFileContents = walker.cat( kBowerFileName );
		var bowerJSON;

		try {
			bowerJSON = JSON.parse( bowerFileContents.toString() );

			if( bowerJSON.dependencies ) {
				_.extend( bundleOptions, {
					dependencies : _.map( _.keys( bowerJSON.dependencies ), function( dep ) {
						return namespacePrefix + dep;
					} )
				} );
			}
		}
		catch( e ) {
			console.log( "Failed to parse contents of bower.json file in " + bundleName );
		}
	}

	if( _.isUndefined( bundleOptions.directoriesToFlatten ) )
		bundleOptions.directoriesToFlatten = dirOptions.directoriesToFlatten;

	//bundleOptions.browserify_executeOnLoad = _.map( bundleOptions.browserify_executeOnLoad, function( autorunFiles ) {
	//	return path.join( directory, autorunFiles );
	//} );

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		if( fileStats.isDirectory() ) {
			if( _.contains( bundleOptions.directoriesToIgnore, fileName ) ) {
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
				if( bundleOptions.prioritizeFlattenedDirectories ) {
					fileDependencies = _.union( subdirectoryFiles, fileDependencies );
				}
				else
					fileDependencies = _.union( fileDependencies, subdirectoryFiles );

			}
			else {
				_.extend( bundleRegistry, createRegistryForDirectory( walker.fullPath( fileName ), rootDir, dirOptions, mode ) );
			}
		}
		else if( fileStats.isFile() ) {
			if( File.isAssetFileName( fileName ) ) {
				//if prioritizeSubdirectories is true, append the file at the end.
				//otherwise append it at the beginning
				if( bundleOptions.prioritizeFlattenedDirectories )
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

	if( ! _.isUndefined( bundleOptions.whitelistedFiles ) ) {
		fileDependencies = _.intersection( fileDependencies, bundleOptions.whitelistedFiles );
	}

	// if priority files are specified, push them to the beginning
	if( bundleOptions.filePriority.length > 0 ) {
		var invalidFilesInFilePriority = _.difference( bundleOptions.filePriority, fileDependencies );

		if( invalidFilesInFilePriority.length > 0 )
			throw new Error( "The following files listed in the filePriority in the bundle.json of " + bundleName + " do not exist: " + invalidFilesInFilePriority.join( ",") );

		fileDependencies = _.union( bundleOptions.filePriority, _.difference( fileDependencies, bundleOptions.filePriority ) );
	}

	dynamicallyLoadedFiles = bundleOptions.dynamicallyLoadedFiles;

	//remove dynamically loaded files from the file dependencies list
	if( dynamicallyLoadedFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, dynamicallyLoadedFiles );

	if( mode === "dev" && bundleOptions.prodModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.prodModeOnlyFiles );
	else if( mode === "prod" && bundleOptions.devModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.devModeOnlyFiles );

	// remove files that we want to ignore
	if( bundleOptions.filesToIgnore.length > 0 )
		fileDependencies = _.difference( fileDependencies, bundleOptions.filesToIgnore );

	var bundleFiles = [];

	fileDependencies = _.filter( fileDependencies, function( filePath ) {
		if( File.isImageFileName( filePath ) ) {
			dynamicallyLoadedFiles.push( filePath );
			return false;
		}
		else
			return true;
	} );

	_.each( fileDependencies, function( filePath ) {
		var file = File.createAndRegister( { src : walker.fullPath( filePath ), keepSeparate : false } );
		if( _.contains( bundleOptions.browserify_executeOnLoad, filePath ) )
			file.isBrowserify_executeOnLoad = true;
		bundleFiles.push( file );
	} );

	_.each( dynamicallyLoadedFiles, function( filePath ) {
		var file =  File.createAndRegister( { src : walker.fullPath( filePath ), keepSeparate : false } );
		file.isDynamicallyLoaded = true;
		if( _.contains( bundleOptions.browserify_executeOnLoad, filePath ) )
			file.isBrowserify_executeOnLoad = true;
		bundleFiles.push( file );
	} );

	bundleRegistry[ bundleName ] = new Bundle( {
		name : bundleName,
		directory : bundleDestDir,
		dirOptions : dirOptions,
		files : bundleFiles,
		directoriesToFlatten : bundleOptions.directoriesToFlatten,
		dependencies : bundleOptions.dependencies,
		keepSeparate : bundleOptions.keepSeparate,
		packageJson : bundleOptions.packageJson,
		browserify_executeOnLoad : bundleOptions.browserify_executeOnLoad
	} );

	return bundleRegistry;
}

module.exports = Bundle;
